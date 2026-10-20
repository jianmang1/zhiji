"""Assemble three deployable CloudBase HTTP function directories under cloudbase/dist."""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FUNCTIONS = ("recordEvent", "listEvents", "generatePlan")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-deps",
        action="store_true",
        help="Do not vendor Linux Python 3.11 dependencies",
    )
    args = parser.parse_args()
    source = ROOT / "functions"
    shared = ROOT / "src" / "zhiji_cloudbase"
    target_root = (ROOT / "dist").resolve()
    if target_root.parent != ROOT.resolve():
        raise RuntimeError("Refusing to build outside cloudbase/dist")
    if target_root.exists():
        shutil.rmtree(target_root)
    target_root.mkdir(parents=True)

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
        if not args.skip_deps:
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pip",
                    "install",
                    "--disable-pip-version-check",
                    "--only-binary=:all:",
                    "--platform=manylinux2014_x86_64",
                    "--python-version=3.11",
                    "--implementation=cp",
                    "--abi=cp311",
                    "--target",
                    str(destination / "third_party"),
                    "-r",
                    str(ROOT / "requirements.txt"),
                ],
                check=True,
            )
        print(f"Prepared {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
