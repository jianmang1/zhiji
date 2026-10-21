import base64
import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from zhiji_cloudbase.auth import AuthenticationError, bearer_token, user_id_from_token
from zhiji_cloudbase.config import (
    env_id,
    fernet_key,
    gateway_base_url,
    llm_model,
    llm_provider,
)
from zhiji_cloudbase.encryption import decrypt_payload, encrypt_payload
from zhiji_cloudbase.gateway import CloudBaseError, CloudBaseGateway
from zhiji_cloudbase.handlers import dispatch
from zhiji_cloudbase.http_function import parse_request_body
from zhiji_cloudbase.score_engine import score_domain
from zhiji_cloudbase.validation import ListEventsInput, parse_time


def make_token(user_id: str | None = None, role: str = "authenticated") -> str:
    claims = {"sub": user_id or str(uuid4()), "role": role}
    encoded = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"e30.{encoded}.signature"


def auth_headers(token: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {token or make_token()}"}


class FakeGateway:
    def __init__(self, token: str):
        self.token = token
        self.rows: list[dict] = []
        self.filters: dict | None = None
        self.filter_history: list[dict] = []
        self.chat_messages: list[dict] | None = None
        self.chat_response = {
            "model": "hy3",
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "summary": "Small, consistent changes",
                                "actions": [
                                    {
                                        "title": "Plan sleep",
                                        "why": "Build a routine",
                                        "effort": "mid",
                                    },
                                    {
                                        "title": "Set bedtime",
                                        "why": "Start small",
                                        "effort": "low",
                                    },
                                ],
                                "next_milestone": "Reach seven hours most nights",
                            }
                        )
                    }
                }
            ],
        }
        self.analytics_rows: list[dict] = []
        self.profile: dict = {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def insert_event(self, row):
        self.rows.append(row)
        return 42

    def insert_plan(self, row):
        self.rows.append(row)
        return "6b184343-7b59-4d70-9e42-7ac2082f04d0"

    def list_events(self, filters):
        self.filters = filters
        self.filter_history.append(filters)
        return list(self.rows)

    def complete_chat(self, model, messages):
        self.chat_messages = messages
        assert model
        return self.chat_response

    def list_analytics_events(self, domain, date_range):
        self.analytics_query = (domain, date_range)
        return list(self.analytics_rows)

    def get_profile(self):
        return self.profile


@pytest.fixture(autouse=True)
def runtime_settings(monkeypatch):
    monkeypatch.setenv("TCB_ENV", "test-env")
    monkeypatch.setenv("FERNET_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("TCB_AI_MODEL", "hy3")


def test_sensitive_event_payload_is_encrypted_and_round_trips():
    payload = {"duration": 7.5, "note": "private health details"}
    encrypted = encrypt_payload("health", payload)
    assert "private health details" not in str(encrypted)
    assert decrypt_payload("health", encrypted) == payload


def test_non_sensitive_event_payload_remains_json():
    payload = {"project": "alpha"}
    assert encrypt_payload("work", payload) == payload


def test_score_engine_mirrors_frozen_weekly_thresholds_and_tiers():
    now = datetime(2026, 10, 20, tzinfo=UTC)
    events = [
        {
            "domain": "health",
            "type": "water",
            "payload": {"ml": 2000},
            "ts": "2026-10-19T00:00:00Z",
        },
        {
            "domain": "health",
            "type": "sleep",
            "payload": {"duration_h": 49},
            "ts": "2026-10-19T00:00:00Z",
        },
        {
            "domain": "health",
            "type": "workout",
            "payload": {"duration_min": 210},
            "ts": "2026-10-19T00:00:00Z",
        },
        {
            "domain": "health",
            "type": "water",
            "payload": {"ml": 5000},
            "ts": "2026-10-01T00:00:00Z",
        },
    ]
    assert score_domain("health", events, now) == {
        "domain": "health",
        "score": 100,
        "tier": "最强王者",
        "event_count": 3,
    }


def test_config_reads_runtime_values_and_has_safe_defaults(monkeypatch):
    monkeypatch.delenv("TCB_ENV_ID", raising=False)
    monkeypatch.setenv("TCB_ENV", "runtime-env")
    assert env_id() == "runtime-env"
    assert gateway_base_url() == "https://runtime-env.api.tcloudbasegateway.com"
    assert fernet_key()
    assert llm_provider() == "cloudbase"
    assert llm_model() == "hy3"


def test_auth_token_validation_rejects_bad_role_and_header():
    with pytest.raises(AuthenticationError):
        bearer_token({"authorization": "Basic abc"})
    with pytest.raises(AuthenticationError):
        user_id_from_token(make_token(role="anon"))


def test_user_id_from_token_preserves_numeric_cloudbase_sub():
    assert user_id_from_token(make_token("2112717453276565505")) == "2112717453276565505"


def test_payload_decryption_fails_closed_for_plain_or_corrupt_sensitive_rows():
    with pytest.raises(RuntimeError, match="not encrypted"):
        decrypt_payload("health", {"duration": 8})
    with pytest.raises(RuntimeError, match="Unable to decrypt"):
        decrypt_payload("health", {"_encrypted_v1": "corrupted"})


def test_range_validation_requires_timezone_and_order():
    with pytest.raises(ValueError):
        parse_time("2026-10-20T12:00:00")
    with pytest.raises(ValueError):
        ListEventsInput.model_validate({"range": {"other": "x"}})
    with pytest.raises(ValueError):
        ListEventsInput.model_validate(
            {"range": {"from": "2026-10-21T00:00:00Z", "to": "2026-10-20T00:00:00Z"}}
        )


def test_http_request_body_size_and_json_validation():
    assert parse_request_body("2", b"{}") == (200, {})
    assert parse_request_body("0", b"")[0] == 400
    assert parse_request_body("2", b"[")[0] == 400


def test_gateway_builds_rls_scoped_rest_queries():
    seen = []

    def responder(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[{"id": 1}])

    client = httpx.Client(transport=httpx.MockTransport(responder))
    with CloudBaseGateway("user-token", client) as gateway:
        rows = gateway.list_events(
            {
                "domain": "health",
                "range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T00:00:00Z"},
                "limit": 10,
            }
        )
    client.close()
    request = seen[0]
    assert rows == [{"id": 1}]
    assert request.headers["Authorization"] == "Bearer user-token"
    assert request.url.path == "/v1/rdb/rest/events"
    assert request.url.params["domain"] == "eq.health"
    assert request.url.params.get_list("ts") == [
        "gte.2026-10-01T00:00:00Z",
        "lte.2026-10-20T00:00:00Z",
    ]
    assert request.url.params["limit"] == "10"


def test_gateway_inserts_events_and_plans_using_user_token():
    seen = []

    def responder(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if "/plans" in request.url.path:
            return httpx.Response(201, json=[{"id": "plan-id"}])
        return httpx.Response(201, json=[{"id": 55}])

    client = httpx.Client(transport=httpx.MockTransport(responder))
    with CloudBaseGateway("user-token", client) as gateway:
        event_id = gateway.insert_event({"domain": "work", "payload": {}})
        plan_id = gateway.insert_plan({"title": "Plan"})
    client.close()
    assert event_id == 55
    assert plan_id == "plan-id"
    assert all(
        request.headers["Authorization"] == "Bearer user-token" for request in seen
    )
    assert all(request.headers["Prefer"] == "return=representation" for request in seen)


def test_gateway_calls_cloudbase_model_endpoint():
    seen = []

    def responder(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"choices": []})

    client = httpx.Client(transport=httpx.MockTransport(responder))
    with CloudBaseGateway("user-token", client) as gateway:
        result = gateway.complete_chat("hy3", [{"role": "user", "content": "hello"}])
    client.close()
    assert result == {"choices": []}
    assert seen[0].url.path == "/v1/ai/cloudbase/chat/completions"
    assert seen[0].headers["Authorization"] == "Bearer user-token"


def test_gateway_queries_analytics_and_profile_with_callers_token():
    seen = []

    def responder(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/profiles"):
            return httpx.Response(200, json=[{"region": "Shanghai"}])
        return httpx.Response(200, json=[])

    client = httpx.Client(transport=httpx.MockTransport(responder))
    with CloudBaseGateway("user-token", client) as gateway:
        assert (
            gateway.list_analytics_events(
                "health", {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T00:00:00Z"}
            )
            == []
        )
        assert gateway.get_profile() == {"region": "Shanghai"}
    client.close()
    assert all(
        request.headers["Authorization"] == "Bearer user-token" for request in seen
    )
    analytics = seen[0]
    assert analytics.url.path == "/v1/rdb/rest/analytics_events"
    assert analytics.url.params["domain"] == "eq.health"
    assert analytics.url.params["step"].startswith("in.(health.onboard,")
    assert analytics.url.params.get_list("ts") == [
        "gte.2026-10-01T00:00:00Z",
        "lte.2026-10-20T00:00:00Z",
    ]


def test_gateway_sanitizes_upstream_http_errors():
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                403, text="internal access token must not leak"
            )
        )
    )
    with (
        CloudBaseGateway("user-token", client) as gateway,
        pytest.raises(CloudBaseError) as error,
    ):
        gateway.list_events({})
    client.close()
    assert "internal access token" not in str(error.value)


def test_record_event_encrypts_sensitive_payload_and_uses_authenticated_owner():
    token = make_token()
    created: list[FakeGateway] = []

    def factory(received_token):
        gateway = FakeGateway(received_token)
        created.append(gateway)
        return gateway

    status, response = dispatch(
        "recordEvent",
        {
            "domain": "dating",
            "type": "date_session",
            "ts": "2026-10-20T12:00:00+08:00",
            "payload": {"chat_min": 30, "note": "private shop"},
        },
        auth_headers(token),
        gateway_factory=factory,
    )
    assert status == 201
    assert response == {"id": 42}
    row = created[0].rows[0]
    assert (
        row["user_id"]
        == json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))["sub"]
    )
    assert "private shop" not in str(row["payload"])


def test_record_event_rejects_missing_auth_and_invalid_input():
    status, error = dispatch("recordEvent", {}, {}, gateway_factory=FakeGateway)
    assert status == 401
    assert error["code"] == "unauthorized"

    status, error = dispatch(
        "recordEvent",
        {"domain": "unknown"},
        auth_headers(),
        gateway_factory=FakeGateway,
    )
    assert status == 400
    assert error["message"] == "Invalid function input"


def test_list_events_applies_filters_and_decrypts_payload():
    token = make_token()
    gateway = FakeGateway(token)
    gateway.rows = [
        {
            "id": 12,
            "domain": "health",
            "type": "sleep",
            "ts": "2026-10-20T00:00:00Z",
            "payload": encrypt_payload("health", {"duration": 8}),
            "source": "manual",
            "created_at": "2026-10-20T01:00:00Z",
            "tags": [],
        }
    ]
    status, result = dispatch(
        "listEvents",
        {
            "domain": "health",
            "range": {"from": "2026-10-19T00:00:00Z", "to": "2026-10-21T00:00:00Z"},
            "limit": 20,
        },
        auth_headers(token),
        gateway_factory=lambda _token: gateway,
    )
    assert status == 200
    assert result[0]["payload"] == {"duration": 8}
    assert gateway.filters == {
        "domain": "health",
        "range": {"from": "2026-10-19T00:00:00Z", "to": "2026-10-21T00:00:00Z"},
        "limit": 20,
    }


def test_generate_plan_analyzes_scoped_events_and_persists_traceability():
    token = make_token()
    gateway = FakeGateway(token)
    gateway.rows = [
        {
            "id": 7,
            "domain": "health",
            "type": "sleep",
            "ts": "2026-10-20T00:00:00Z",
            "payload": encrypt_payload("health", {"duration": 6}),
            "source": "manual",
            "created_at": "2026-10-20T01:00:00Z",
            "tags": [],
        }
    ]
    status, response = dispatch(
        "generatePlan",
        {
            "based_on": {
                "domain": "health",
                "range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T23:59:00Z"},
            }
        },
        auth_headers(token),
        gateway_factory=lambda _token: gateway,
    )
    assert status == 201
    assert response["id"] == "6b184343-7b59-4d70-9e42-7ac2082f04d0"
    assert gateway.filter_history[0] == {
        "limit": 200,
        "domain": "health",
        "range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T23:59:00Z"},
    }
    assert gateway.filters["domain"] == "health"
    plan = gateway.rows[-1]
    assert plan["generated_by"] == "hy3"
    assert plan["based_on"]["event_ids"] == [7]
    assert plan["based_on"]["event_count"] == 1
    assert plan["content"]["summary"] == "Small, consistent changes"
    assert plan["content"]["domain"] == "health"
    assert plan["content"]["tier"] == "倔强青铜"
    assert [action["effort"] for action in plan["content"]["actions"]] == ["low", "mid"]
    assert '"duration":6' in gateway.chat_messages[1]["content"]


def test_generate_plan_rejects_unsupported_filters():
    status, error = dispatch(
        "generatePlan",
        {"based_on": {"user_id": "someone-else"}},
        auth_headers(),
        gateway_factory=FakeGateway,
    )
    assert status == 400
    assert error["code"] == "bad_request"


def test_generate_plan_rejects_invalid_model_schema_without_persisting():
    gateway = FakeGateway(make_token())
    gateway.chat_response["choices"][0]["message"]["content"] = json.dumps(
        {
            "summary": "Short plan",
            "actions": [{"title": "Only one", "why": "Start", "effort": "low"}],
            "next_milestone": "Next week",
        }
    )
    status, error = dispatch(
        "generatePlan",
        {"based_on": {"domain": "health"}},
        auth_headers(gateway.token),
        gateway_factory=lambda _token: gateway,
    )
    assert status == 502
    assert error["code"] == "upstream_error"
    assert not gateway.rows
    status, error = dispatch(
        "generatePlan",
        {
            "based_on": {
                "range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T00:00:00Z"}
            }
        },
        auth_headers(),
        gateway_factory=FakeGateway,
    )
    assert status == 400
    assert error["code"] == "bad_request"


def test_get_funnel_counts_ordered_steps_and_separates_reactivation():
    token = make_token()
    gateway = FakeGateway(token)
    gateway.analytics_rows = [
        {"step": "product.acquire", "channel": "organic"},
        {"step": "product.acquire", "channel": "organic"},
        {"step": "product.activate", "channel": "organic"},
        {"step": "product.retain", "channel": "organic"},
        {"step": "product.reactive", "channel": "organic"},
        {"step": "health.water", "channel": "organic"},
    ]
    status, result = dispatch(
        "getFunnel",
        {"range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T23:59:59Z"}},
        auth_headers(token),
        gateway_factory=lambda received: gateway,
    )
    assert status == 200
    assert result["steps"][0] == {
        "step": "product.acquire",
        "count": 2,
        "conv_rate": 1.0,
        "drop_off": 0.0,
    }
    assert result["steps"][1]["conv_rate"] == 0.5
    assert result["bottleneck_step"] == "product.habit"
    assert result["steps"][-1] == {
        "step": "product.reactive",
        "count": 1,
        "conv_rate": None,
        "drop_off": None,
    }
    assert gateway.analytics_query[0] == "product"


def test_get_funnel_filters_segment_using_profile_fallback():
    gateway = FakeGateway(make_token())
    gateway.profile = {"region": "Shanghai", "user_type": "new"}
    gateway.analytics_rows = [
        {"step": "health.onboard", "region": None, "user_type": None},
        {"step": "health.water", "region": "Beijing", "user_type": "new"},
    ]
    status, result = dispatch(
        "getFunnel",
        {
            "domain": "health",
            "range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T23:59:59Z"},
            "segment": {"region": "Shanghai", "user_type": "new"},
        },
        auth_headers(gateway.token),
        gateway_factory=lambda _token: gateway,
    )
    assert status == 200
    assert result["steps"][0]["count"] == 1
    assert result["steps"][1]["count"] == 0
    assert result["segment"] == {"region": "Shanghai", "user_type": "new"}


def test_get_funnel_requires_timezone_range_and_valid_segment():
    for body in (
        {},
        {"range": {"from": "2026-10-01T00:00:00", "to": "2026-10-20T00:00:00Z"}},
        {
            "range": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-20T00:00:00Z"},
            "segment": {},
        },
    ):
        status, _ = dispatch(
            "getFunnel", body, auth_headers(), gateway_factory=FakeGateway
        )
        assert status == 400
