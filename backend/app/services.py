from collections.abc import Mapping

import httpx

from app.core.config import get_settings


async def exchange_wx_code(code: str) -> str:
    settings = get_settings()
    app_id = settings.wx_app_id
    secret = settings.wx_app_secret.get_secret_value()
    if not app_id or not secret:
        raise RuntimeError("WX_APP_ID and WX_APP_SECRET must be configured")
    async with httpx.AsyncClient(base_url=settings.wx_api_base_url, timeout=10) as client:
        response = await client.get(
            "/sns/jscode2session",
            params={
                "appid": app_id,
                "secret": secret,
                "js_code": code,
                "grant_type": "authorization_code",
            },
        )
        response.raise_for_status()
        data: Mapping[str, object] = response.json()
    if data.get("errcode") or not isinstance(data.get("openid"), str):
        raise ValueError("WeChat rejected the login code")
    return str(data["openid"])
