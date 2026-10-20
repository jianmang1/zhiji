import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from zhiji_cloudbase.config import fernet_key

SENSITIVE_DOMAINS = frozenset({"health", "dating"})
ENVELOPE_KEY = "_encrypted_v1"


def _cipher() -> Fernet:
    try:
        return Fernet(fernet_key().encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("FERNET_ENCRYPTION_KEY must be a valid Fernet key") from exc


def encrypt_payload(domain: str, payload: dict[str, Any]) -> dict[str, Any]:
    if domain not in SENSITIVE_DOMAINS:
        return payload
    token = _cipher().encrypt(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    )
    return {ENVELOPE_KEY: token.decode("ascii")}


def decrypt_payload(domain: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = payload.get(ENVELOPE_KEY)
    if token is None:
        if domain in SENSITIVE_DOMAINS:
            raise RuntimeError("Sensitive event payload is not encrypted")
        return payload
    try:
        value = json.loads(_cipher().decrypt(str(token).encode("ascii")))
    except (InvalidToken, UnicodeEncodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Unable to decrypt event payload") from exc
    if not isinstance(value, dict):
        raise TypeError("Decrypted event payload must be a JSON object")
    return value
