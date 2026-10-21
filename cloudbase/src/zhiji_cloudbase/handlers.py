import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError

from zhiji_cloudbase.auth import AuthenticationError, bearer_token, user_id_from_token
from zhiji_cloudbase.config import llm_model
from zhiji_cloudbase.encryption import decrypt_payload, encrypt_payload
from zhiji_cloudbase.funnel import make_funnel
from zhiji_cloudbase.gateway import CloudBaseError, CloudBaseGateway
from zhiji_cloudbase.score_engine import score_domain
from zhiji_cloudbase.validation import (
    EventInput,
    GeneratePlanInput,
    GetFunnelInput,
    ListEventsInput,
)

GatewayFactory = Callable[[str], CloudBaseGateway]
SYSTEM_PROMPT = """你是执己的个人行动分析助手。根据用户授权提供的事件和已计算的本周评分，生成具体、可执行且温和的行动方案。不要推断数据中没有支持的事实，也不要修改 domain/score/tier。只返回 JSON 对象，格式为 {\"summary\": string, \"actions\": [{\"title\": string, \"why\": string, \"effort\": \"low\"|\"mid\"|\"high\"}], \"next_milestone\": string}。actions 必须有 2 至 4 条，并按 effort 从 low 到 mid 到 high 排序。不要输出 Markdown 代码围栏。"""


def _decode_model_result(
    response: dict[str, Any], score: dict[str, Any]
) -> tuple[dict[str, Any], str]:
    try:
        content = response["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("content is not text")
        value = json.loads(content.strip())
        if not isinstance(value, dict):
            raise TypeError("model output is not an object")
        if set(value) != {"summary", "actions", "next_milestone"}:
            raise ValueError("model output contains unexpected fields")
        summary = value.get("summary")
        actions = value.get("actions")
        next_milestone = value.get("next_milestone")
        if not isinstance(summary, str) or not summary.strip():
            raise ValueError("model output is missing summary")
        if not isinstance(next_milestone, str) or not next_milestone.strip():
            raise ValueError("model output is missing next_milestone")
        if not isinstance(actions, list) or not 2 <= len(actions) <= 4:
            raise ValueError("model output must contain 2 to 4 actions")
        effort_order = {"low": 0, "mid": 1, "high": 2}
        normalized_actions: list[dict[str, str]] = []
        for action in actions:
            if not isinstance(action, dict):
                raise TypeError("model action must be an object")
            if set(action) != {"title", "why", "effort"}:
                raise ValueError("model action contains unexpected fields")
            title, why, effort = (
                action.get("title"),
                action.get("why"),
                action.get("effort"),
            )
            if (
                not isinstance(title, str)
                or not title.strip()
                or not isinstance(why, str)
                or not why.strip()
                or effort not in effort_order
            ):
                raise ValueError("model action does not match the action schema")
            normalized_actions.append(
                {"title": title.strip(), "why": why.strip(), "effort": effort}
            )
        normalized_actions.sort(key=lambda action: effort_order[action["effort"]])
        plan_content = {
            **score,
            "summary": summary.strip(),
            "actions": normalized_actions,
            "next_milestone": next_milestone.strip(),
        }
        model = response.get("model")
        if not isinstance(model, str) or not model.strip():
            model = llm_model()
        return plan_content, model
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise CloudBaseError("CloudBase returned invalid plan output") from exc


def _fallback_plan(score: dict[str, Any]) -> dict[str, Any]:
    domain_actions = {
        "health": [
            {"title": "选择一个健康习惯连续记录 3 天", "why": "先用稳定记录建立可观察的节奏", "effort": "low"},
            {"title": "为下周安排一次短时训练", "why": "把行动拆成容易开始的一步", "effort": "mid"},
        ],
        "work": [
            {"title": "记录下一次工作时段", "why": "补充稳定数据，便于复盘投入", "effort": "low"},
            {"title": "为本周选定一个优先任务", "why": "减少分散，推进一项可完成的结果", "effort": "mid"},
        ],
        "dating": [
            {"title": "记录一次真实的交流感受", "why": "先观察互动体验，不急于下结论", "effort": "low"},
            {"title": "安排一次轻松、明确的交流", "why": "用小步行动积累可复盘的经验", "effort": "mid"},
        ],
    }
    return {
        **score,
        "summary": f"当前得分为 {score['score']}，段位为{score['tier']}。AI 暂不可用，以下是基于规则的通用建议。",
        "actions": domain_actions[score["domain"]],
        "next_milestone": "持续记录 7 天后再复盘变化",
    }


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
                now = datetime.now(UTC)
                week_filters = {
                    "domain": based_on["domain"],
                    "range": {
                        "from": (now - timedelta(days=7)).isoformat(),
                        "to": now.isoformat(),
                    },
                    "limit": 200,
                }
                weekly_rows = gateway.list_events(week_filters)
                weekly_events = []
                for row in weekly_rows:
                    domain, payload = row.get("domain"), row.get("payload")
                    if not isinstance(domain, str) or not isinstance(payload, dict):
                        raise CloudBaseError("CloudBase returned an invalid event")
                    weekly_events.append(
                        {**row, "payload": decrypt_payload(domain, payload)}
                    )
                score = score_domain(based_on["domain"], weekly_events, now)
                ai_enabled = True
                try:
                    response = gateway.complete_chat(
                        llm_model(),
                        [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {
                                "role": "user",
                                "content": json.dumps(
                                    {
                                        "based_on": based_on,
                                        "score": score,
                                        "events": events,
                                    },
                                    ensure_ascii=False,
                                    separators=(",", ":"),
                                ),
                            },
                        ],
                    )
                    content, model = _decode_model_result(response, score)
                except (CloudBaseError, RuntimeError):
                    ai_enabled = False
                    content, model = _fallback_plan(score), "rules-fallback"
                title = {
                    "health": "薄肌王",
                    "work": "力王",
                    "dating": "黄毛王",
                }[based_on["domain"]] + "行动方案"
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
            return 201, {
                "id": plan_id,
                "ai_enabled": ai_enabled,
                **({"content": content} if not ai_enabled else {}),
            }

        if operation == "getFunnel":
            funnel_request = GetFunnelInput.model_validate(body)
            segment = (
                funnel_request.segment.model_dump(exclude_none=True)
                if funnel_request.segment
                else None
            )
            with gateway_factory(token) as gateway:
                events = gateway.list_analytics_events(
                    funnel_request.domain, funnel_request.range
                )
                profile = gateway.get_profile() if segment else {}
            return 200, make_funnel(events, funnel_request.domain, segment, profile)

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
