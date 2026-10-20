import base64
import json
from uuid import UUID


class AuthenticationError(ValueError):
    pass


def bearer_token(headers: dict[str, str]) -> str:
    """Read the user's forwarded CloudBase access token; never accept a body token."""
    normalized = {key.lower(): value for key, value in headers.items()}
    value = normalized.get("authorization", "")
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthenticationError("A CloudBase user access token is required")
    return token.strip()


def user_id_from_token(token: str) -> str:
    """Read sub to populate user_id; CloudBase verifies the signature and RLS enforces it."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("not a JWT")
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode()))
        if not isinstance(claims, dict):
            raise TypeError("JWT claims must be an object")
        if claims.get("role") != "authenticated":
            raise ValueError("not an authenticated user token")
        return str(UUID(claims["sub"]))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise AuthenticationError(
            "A valid authenticated CloudBase user token is required"
        ) from exc
