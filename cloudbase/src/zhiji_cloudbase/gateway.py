from typing import Any, Self
from urllib.parse import quote

import httpx

from zhiji_cloudbase.config import gateway_base_url, llm_provider


class CloudBaseError(RuntimeError):
    pass


class CloudBaseGateway:
    """CloudBase PostgREST and AI gateway adapter using the caller's RLS-scoped token."""

    def __init__(self, token: str, client: httpx.Client | None = None) -> None:
        self.token = token
        self._client = client

    def __enter__(self) -> Self:
        if self._client is None:
            self._client = httpx.Client(timeout=httpx.Timeout(45.0, connect=5.0))
            self._owns_client = True
        else:
            self._owns_client = False
        return self

    def __exit__(self, *_: object) -> None:
        if self._owns_client and self._client is not None:
            self._client.close()

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            raise RuntimeError("CloudBaseGateway must be used as a context manager")
        return self._client

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            headers = {
                "Authorization": f"Bearer {self.token}",
                **kwargs.pop("headers", {}),
            }
            response = self.client.request(
                method,
                f"{gateway_base_url()}{path}",
                headers=headers,
                **kwargs,
            )
            response.raise_for_status()
            return response.json() if response.content else None
        except httpx.HTTPStatusError as exc:
            # Never echo gateway response bodies, which may contain internal details.
            raise CloudBaseError(
                f"CloudBase returned HTTP {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            raise CloudBaseError("CloudBase gateway request failed") from exc

    def list_events(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[tuple[str, str]] = [
            ("select", "id,domain,type,ts,payload,source,created_at,tags(id,tag)"),
            ("order", "ts.desc"),
            ("limit", str(filters.get("limit", 50))),
        ]
        if filters.get("domain"):
            params.append(("domain", f"eq.{filters['domain']}"))
        date_range = filters.get("range") or {}
        if date_range.get("from"):
            params.append(("ts", f"gte.{date_range['from']}"))
        if date_range.get("to"):
            params.append(("ts", f"lte.{date_range['to']}"))
        result = self._request("GET", "/v1/rdb/rest/events", params=params)
        if not isinstance(result, list):
            raise CloudBaseError("CloudBase returned an invalid event list")
        return result

    def insert_event(self, row: dict[str, Any]) -> int:
        result = self._request(
            "POST",
            "/v1/rdb/rest/events",
            json=row,
            headers={"Prefer": "return=representation"},
        )
        if (
            not isinstance(result, list)
            or not result
            or not isinstance(result[0].get("id"), int)
        ):
            raise CloudBaseError("CloudBase did not return the new event id")
        return result[0]["id"]

    def insert_plan(self, row: dict[str, Any]) -> str:
        result = self._request(
            "POST",
            "/v1/rdb/rest/plans",
            json=row,
            headers={"Prefer": "return=representation"},
        )
        if (
            not isinstance(result, list)
            or not result
            or not isinstance(result[0].get("id"), str)
        ):
            raise CloudBaseError("CloudBase did not return the new plan id")
        return result[0]["id"]

    def complete_chat(
        self, model: str, messages: list[dict[str, str]]
    ) -> dict[str, Any]:
        provider = quote(llm_provider(), safe="")
        result = self._request(
            "POST",
            f"/v1/ai/{provider}/chat/completions",
            json={"model": model, "messages": messages, "stream": False},
        )
        if not isinstance(result, dict):
            raise CloudBaseError("CloudBase returned an invalid model response")
        return result
