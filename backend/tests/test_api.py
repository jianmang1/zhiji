from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from jose import jwt

from app.core.config import get_settings
from app.core.encryption import protect_event, reveal_event
from app.core.security import create_token, create_token_pair, get_current_user
from app.main import http_error, validation_error
from app.models import Domain, Event


@pytest.mark.asyncio
async def test_login_create_and_read_event(client, monkeypatch):
    from app import routers

    monkeypatch.setattr(routers, "exchange_wx_code", AsyncMock(return_value="openid-test"))
    login = await client.post("/v1/auth/wx-login", json={"code": "temporary-code"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post(
        "/v1/events",
        headers=headers,
        json={
            "domain": "health",
            "type": "sleep",
            "ts": "2026-10-19T00:00:00Z",
            "payload": {"duration": 8},
            "source": "manual",
        },
    )
    assert created.status_code == 201
    event_id = created.json()["id"]
    fetched = await client.get(f"/v1/events/{event_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["payload"] == {"duration": 8}


@pytest.mark.asyncio
async def test_events_require_authentication(client):
    response = await client.get("/v1/events")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_event_crud(client):
    login = await client.post("/v1/auth/wx-login", json={"code": "unused"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = await client.post(
        "/v1/events",
        headers=headers,
        json={
            "domain": "work",
            "type": "focus_session",
            "ts": "2026-10-19T01:00:00Z",
            "payload": {},
            "source": "manual",
        },
    )
    event_id = response.json()["id"]
    updated = await client.put(
        f"/v1/events/{event_id}",
        headers=headers,
        json={
            "domain": "work",
            "type": "task",
            "ts": "2026-10-19T02:00:00Z",
            "payload": {"done": True},
        },
    )
    assert updated.status_code == 200
    assert updated.json()["type"] == "task"
    assert (await client.delete(f"/v1/events/{event_id}", headers=headers)).status_code == 204
    assert (await client.get(f"/v1/events/{event_id}", headers=headers)).status_code == 404


def test_refresh_token_lifetime_is_longer_than_access():
    settings = get_settings()
    access, refresh, expires = create_token_pair(uuid4())
    claims = jwt.decode(access, settings.jwt_secret_key.get_secret_value(), algorithms=["HS256"])
    refresh_claims = jwt.decode(
        refresh, settings.jwt_secret_key.get_secret_value(), algorithms=["HS256"]
    )
    assert expires == 900
    assert claims["type"] == "access"
    assert refresh_claims["type"] == "refresh"
    assert refresh_claims["exp"] - claims["iat"] == 30 * 24 * 60 * 60


def test_token_creation_requires_a_secret(monkeypatch):
    from datetime import timedelta

    monkeypatch.setenv("JWT_SECRET_KEY", "")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        create_token(uuid4(), "access", timedelta(minutes=15))


def test_sensitive_event_payload_is_encrypted_and_round_trips():
    event = Event(domain=Domain.health, payload={"duration": 8})
    protect_event(event)
    assert "duration" not in str(event.payload)
    assert reveal_event(event).payload == {"duration": 8}


def test_non_sensitive_event_payload_is_not_encrypted():
    event = Event(domain=Domain.work, payload={"project": "alpha"})
    protect_event(event)
    assert event.payload == {"project": "alpha"}


@pytest.mark.asyncio
async def test_authentication_rejects_missing_credentials():
    with pytest.raises(HTTPException) as error:
        await get_current_user(None, AsyncMock())
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_authentication_rejects_malformed_token():
    credentials = type("Credentials", (), {"credentials": "not-a-jwt"})()
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials, AsyncMock())
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_authentication_rejects_refresh_token():
    user_id = uuid4()
    _, refresh, _ = create_token_pair(user_id)
    credentials = type("Credentials", (), {"credentials": refresh})()
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials, AsyncMock())
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_authentication_loads_user_for_valid_access_token():
    from app.models import User

    user = User(id=uuid4(), openid="unit-test")
    access, _, _ = create_token_pair(user.id)
    credentials = type("Credentials", (), {"credentials": access})()
    db = AsyncMock()
    db.get.return_value = user
    assert await get_current_user(credentials, db) is user


@pytest.mark.asyncio
async def test_authentication_rejects_token_for_missing_user():
    access, _, _ = create_token_pair(uuid4())
    credentials = type("Credentials", (), {"credentials": access})()
    db = AsyncMock()
    db.get.return_value = None
    with pytest.raises(HTTPException) as error:
        await get_current_user(credentials, db)
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_error_handlers_return_contract_error_shape():
    http = await http_error(None, HTTPException(404, "Not found"))
    validation = await validation_error(None, RequestValidationError([]))
    assert http.status_code == 404
    assert http.body == b'{"code":"http_error","message":"Not found"}'
    assert validation.status_code == 400
    assert b'"code":"bad_request"' in validation.body
