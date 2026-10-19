from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "zhiji-api"
    api_v1_prefix: str = "/v1"
    database_url: str = "postgresql+asyncpg://localhost/zhiji"
    jwt_secret_key: SecretStr = SecretStr("")
    fernet_encryption_key: SecretStr = SecretStr("")
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    wx_app_id: str = ""
    wx_app_secret: SecretStr = SecretStr("")
    wx_api_base_url: str = "https://api.weixin.qq.com"
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
