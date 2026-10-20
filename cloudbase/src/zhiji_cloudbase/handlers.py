import json
from collections.abc import Callable
from typing import Any

from pydantic import ValidationError

from zhiji_cloudbase.auth import AuthenticationError, bearer_token, user_id_from_token
from zhiji_cloudbase.config import llm_model
from zhiji_cloudbase.encryption import decrypt_payload, encrypt_payload
from zhiji_cloudbase.gateway import CloudBaseError, CloudBaseGateway
from zhiji_cloudbase.validation import EventInput, GeneratePlanInput, ListEventsInput

GatewayFactory = Callable[[str], CloudBaseGateway]
SYSTEM_PROMPT = """你是执己的个人行动分析助手。根据用户授权提供的事件，生成具体、可执行且温和的行动方案。不要推断数据中没有支持的事实。仅返回 JSON 对象，格式为 {\"title\": string, \"content\": {\"summary\": string, \"actions\": [{\"action\": string, \"rationale\": string, \"cadence\": string}]}}。不要输出 Markdown 代码围栏。"""


def _decode_model_result(response: dict[str, Any]) -> tuple[str, dict[str, Any], str]:
    try:
        content = response["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("content is not text")
        value = json.loads(content.strip())
        if not isinstance(value, dict):
            raise TypeError("model output is not an object")
        title = value.get("title")
        plan_content = value.get("content")
        if (
            not isinstance(title, str)
            or not title.strip()
            or not isinstance(plan_content, dict)
        ):
            raise ValueError("model output is missing title or content object")
        model = response.get("model")
        if not isinstance(model, str) or not model.strip():
            model = llm_model()
        return title.strip(), plan_content, model
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError(
            "The AI response did not match the required plan JSON format"
        ) from exc


def dispatch(
    operation: str,
    body: Any,
    headers: dict[str, str],
    gateway_factory: GatewayFactory = CloudBaseGateway,
) -> tuple[int, dict[str, Any] | list[dict[str, Any]]]:
    try:
        token = bearer_token(headers)
        user_id = user_id_from_token(token)
        if not isinstance(body, dict):
            raise TypeError("Request body must be a JSON object")

        if operation == "recordEvent":
            data = EventInput.model_validate(body)
            row = data.model_dump(mode="json")
            row["payload"] = encrypt_payload(data.domain, data.payload)
            row["user_id"] = user_id
            with gateway_factory(token) as gateway:
                event_id = gateway.insert_event(row)
            return 201, {"id": event_id}

        if operation == "listEvents":
            filters = ListEventsInput.model_validate(body).model_dump(exclude_none=True)
            with gateway_factory(token) as gateway:
                rows = gateway.list_events(filters)
            for row in rows:
                domain, payload = row.get("domain"), row.get("payload")
                if not isinstance(domain, str) or not isinstance(payload, dict):
                    raise CloudBaseError("CloudBase returned an invalid event")
                row["payload"] = decrypt_payload(domain, payload)
            return 200, rows

        if operation == "generatePlan":
            request = GeneratePlanInput.model_validate(body)
            based_on = request.based_on
            plan_filters: dict[str, Any] = {"limit": 200}
            if "domain" in based_on:
                plan_filters["domain"] = based_on["domain"]
            if "range" in based_on:
                plan_filters["range"] = based_on["range"]
            with gateway_factory(token) as gateway:
                rows = gateway.list_events(plan_filters)
                events: list[dict[str, Any]] = []
                for row in rows:
                    domain, payload = row.get("domain"), row.get("payload")
                    if not isinstance(domain, str) or not isinstance(payload, dict):
                        raise CloudBaseError("CloudBase returned an invalid event")
                    events.append({**row, "payload": decrypt_payload(domain, payload)})
                response = gateway.complete_chat(
                    llm_model(),
                    [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": json.dumps(
                                {"based_on": based_on, "events": events},
                                ensure_ascii=False,
                                separators=(",", ":"),
                            ),
                        },
                    ],
                )
                title, content, model = _decode_model_result(response)
                plan_id = gateway.insert_plan(
                    {
                        "user_id": user_id,
                        "title": title,
                        "generated_by": model,
                        "based_on": {
                            "filters": based_on,
                            "event_ids": [
                                event["id"] for event in events if "id" in event
                            ],
                            "event_count": len(events),
                        },
                        "content": content,
                    }
                )
            return 201, {"id": plan_id}

        raise ValueError("Unknown function")
    except AuthenticationError as exc:
        return 401, {"code": "unauthorized", "message": str(exc)}
    except ValidationError:
        return 400, {"code": "bad_request", "message": "Invalid function input"}
    except (TypeError, ValueError) as exc:
        return 400, {"code": "bad_request", "message": str(exc)}
    except CloudBaseError:
        return 502, {"code": "upstream_error", "message": "CloudBase request failed"}
    except RuntimeError:
        return 500, {
            "code": "internal_error",
            "message": "Cloud function configuration or processing failed",
        }
