import os


def env_id() -> str:
    value = (os.getenv("TCB_ENV_ID") or os.getenv("TCB_ENV") or "").strip()
    if not value:
        raise RuntimeError("TCB_ENV_ID is required")
    return value


def fernet_key() -> str:
    value = os.getenv("FERNET_ENCRYPTION_KEY", "").strip()
    if not value:
        raise RuntimeError(
            "FERNET_ENCRYPTION_KEY is required for health/consumption events"
        )
    return value


def llm_provider() -> str:
    return os.getenv("TCB_AI_PROVIDER", "cloudbase").strip()


def llm_model() -> str:
    value = os.getenv("TCB_AI_MODEL", "hy3").strip()
    if not value:
        raise RuntimeError("TCB_AI_MODEL must not be empty")
    return value


def gateway_base_url() -> str:
    return f"https://{env_id()}.api.tcloudbasegateway.com"
