from datetime import UTC, datetime, timedelta
from typing import Any

DEFAULT_EXPECTED_MONTHLY_WAGE = 20_000
TIER_NAMES = (
    (90, "最强王者"),
    (70, "荣耀黄金"),
    (40, "秩序白银"),
    (0, "倔强青铜"),
)
RULES: dict[str, tuple[tuple[str, str, float, float, bool], ...]] = {
    "health": (
        ("water_ml", "饮水", 2000, 0.30, False),
        ("sleep_h", "睡眠", 49, 0.30, False),
        ("workout_min", "训练", 210, 0.40, False),
    ),
    "work": (
        ("work_hours", "工作时长", 40, 0.35, False),
        ("wage", "收入", DEFAULT_EXPECTED_MONTHLY_WAGE / 4, 0.35, False),
        ("commute_min", "通勤", 350, 0.30, True),
    ),
    "dating": (
        ("approach_count", "主动搭讪", 8, 0.25, False),
        ("date_count", "约会", 4, 0.25, False),
        ("chat_min", "聊天", 300, 0.20, False),
        ("stage", "脱单进度", 5, 0.30, False),
    ),
}
FIELDS = {
    "health": (
        ("water_ml", "water", "ml", "sum"),
        ("sleep_h", "sleep", "duration_h", "sum"),
        ("workout_min", "workout", "duration_min", "sum"),
    ),
    "work": (
        ("work_hours", "work_log", "hours", "sum"),
        ("wage", "work_log", "wage", "sum"),
        ("commute_min", "work_log", "commute_min", "sum"),
    ),
    "dating": (
        ("approach_count", "approach", "count", "sum"),
        ("date_count", "date", "count", "sum"),
        ("chat_min", "chat", "duration_min", "sum"),
        ("stage", "stage", "stage", "max"),
    ),
}


def score_domain(
    domain: str,
    events: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Mirror frontend/src/scoring/engine.ts for a rolling seven-day window."""
    now = now or datetime.now(UTC)
    end = now.astimezone(UTC)
    start = end - timedelta(days=7)
    weekly = [
        event
        for event in events
        if event.get("domain") == domain and _in_window(event.get("ts"), start, end)
    ]
    values = {metric: 0.0 for metric, *_ in FIELDS[domain]}
    for metric, event_type, field, aggregate in FIELDS[domain]:
        extracted = [
            number
            for event in weekly
            if event.get("type") == event_type
            and isinstance(
                (number := event.get("payload", {}).get(field)), (int, float)
            )
            and not isinstance(number, bool)
        ]
        values[metric] = (
            max(extracted, default=0.0) if aggregate == "max" else sum(extracted)
        )

    total = 0.0
    for metric, _label, threshold, weight, reverse in RULES[domain]:
        raw = values[metric]
        ratio = (
            min(1.0, max(0.0, 2.0 - raw / threshold))
            if reverse
            else min(1.0, max(0.0, raw / threshold))
        )
        total += ratio * weight * 100
    score = min(100, max(0, int(total + 0.5)))
    tier = next(name for minimum, name in TIER_NAMES if score >= minimum)
    return {"domain": domain, "score": score, "tier": tier, "event_count": len(weekly)}


def _in_window(value: Any, start: datetime, end: datetime) -> bool:
    if not isinstance(value, str):
        return False
    try:
        timestamp = datetime.fromisoformat(value)
    except ValueError:
        return False
    if timestamp.tzinfo is None:
        return False
    timestamp = timestamp.astimezone(UTC)
    return start < timestamp <= end
