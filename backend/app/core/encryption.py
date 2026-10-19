import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.models import Domain, Event


def _cipher() -> Fernet:
    key = get_settings().fernet_encryption_key.get_secret_value()
    if not key:
        raise RuntimeError("FERNET_ENCRYPTION_KEY must be configured for sensitive event data")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise RuntimeError("FERNET_ENCRYPTION_KEY must be a valid Fernet key") from exc


def protect_event(event: Event) -> None:
    if event.domain in (Domain.health, Domain.consumption):
        ciphertext = (
            _cipher().encrypt(json.dumps(event.payload, separators=(",", ":")).encode()).decode()
        )
        event.payload = {"_encrypted": ciphertext}


def reveal_event(event: Event) -> Event:
    encrypted: Any = event.payload.get("_encrypted")
    if encrypted is not None:
        try:
            event.payload = json.loads(_cipher().decrypt(str(encrypted).encode()))
        except (InvalidToken, json.JSONDecodeError) as exc:
            raise RuntimeError("Unable to decrypt stored event payload") from exc
    return event
