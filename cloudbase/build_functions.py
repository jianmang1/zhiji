"""Assemble three deployable CloudBase HTTP function directories under cloudbase/dist."""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
FUNCTIONS = ("recordEvent", "listEvents", "generatePlan", "getFunnel")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-deps",
        action="store_true",
        help="Do not vendor Linux Python 3.11 dependencies",
    )
    parser.add_argument(
        "--dependency-layer",
        action="store_true",
        help="Package dependencies as a Python 3.11 layer instead of copying them into each function",
    )
    args = parser.parse_args()
    if args.skip_deps and args.dependency_layer:
        parser.error("--dependency-layer requires bundled dependencies")
    source = ROOT / "functions"
    shared = ROOT / "src" / "zhiji_cloudbase"
    target_root = (ROOT / "dist").resolve()
    if target_root.parent != ROOT.resolve():
        raise RuntimeError("Refusing to build outside cloudbase/dist")
    if target_root.exists():
        shutil.rmtree(target_root)
    target_root.mkdir(parents=True)

    dependency_bundle = target_root / "_third_party"
    if not args.skip_deps:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--timeout=60",
                "--retries=5",
                "--only-binary=:all:",
                "--index-url=https://pypi.org/simple",
                "--platform=manylinux2014_x86_64",
                "--python-version=3.11",
                "--implementation=cp",
                "--abi=cp311",
                "--target",
                str(dependency_bundle),
                "-r",
                str(ROOT / "requirements.txt"),
            ],
            check=True,
        )

    for name in FUNCTIONS:
        destination = target_root / name
        destination.mkdir()
        shutil.copy2(source / name / "main.py", destination / "main.py")
        shutil.copy2(source / name / "scf_bootstrap", destination / "scf_bootstrap")
        (destination / "scf_bootstrap").chmod(0o755)
        (destination / "package.json").write_text(
            json.dumps({"name": name}, indent=2) + "\n", encoding="utf-8"
        )
        shutil.copytree(
            shared,
            destination / "zhiji_cloudbase",
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
        )
        shutil.copy2(ROOT / "requirements.txt", destination / "requirements.txt")
        if not args.skip_deps and not args.dependency_layer:
            shutil.copytree(
                dependency_bundle,
                destination / "third_party",
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
            )
        if args.dependency_layer:
            bootstrap = destination / "scf_bootstrap"
            bootstrap.write_text(
                bootstrap.read_text(encoding="utf-8").replace(
                    'export PYTHONPATH="./third_party:$PYTHONPATH"',
                    'export PYTHONPATH="/opt/python/third_party:./third_party:$PYTHONPATH"',
                ),
                encoding="utf-8",
            )
        print(f"Prepared {destination}")
    if dependency_bundle.exists():
        if args.dependency_layer:
            layer_zip = target_root / "python-dependencies-layer.zip"
            with ZipFile(layer_zip, "w", ZIP_DEFLATED, compresslevel=6) as archive:
                for item in dependency_bundle.rglob("*"):
                    if (
                        item.is_file()
                        and "__pycache__" not in item.parts
                        and item.suffix != ".pyc"
                    ):
                        archive.write(
                            item,
                            Path("python/third_party")
                            / item.relative_to(dependency_bundle),
                        )
            print(f"Prepared {layer_zip}")
        shutil.rmtree(dependency_bundle)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
