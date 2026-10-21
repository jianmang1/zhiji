from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

PRODUCT_STEPS = (
    "product.acquire",
    "product.activate",
    "product.retain",
    "product.habit",
    "product.value",
    "product.refer",
    "product.reactive",
)
DOMAIN_STEPS = {
    "dating": (
        "dating.onboard",
        "dating.approach",
        "dating.response",
        "dating.date",
        "dating.stage_up",
        "dating.stage5",
        "dating.refer",
    ),
    "health": (
        "health.onboard",
        "health.water",
        "health.sleep",
        "health.workout",
        "health.active_day",
        "health.body_sense",
        "health.refer",
    ),
    "work": (
        "work.onboard",
        "work.wage",
        "work.spend",
        "work.retain",
        "work.refer",
    ),
}


def make_funnel(
    events: list[dict[str, Any]],
    domain: str,
    segment: dict[str, str] | None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Count only the RLS-visible caller events and calculate ordered drop-off."""
    steps = PRODUCT_STEPS if domain == "product" else DOMAIN_STEPS[domain]
    counts = {step: 0 for step in steps}
    profile = profile or {}
    for event in events:
        step = event.get("step")
        if step not in counts:
            continue
        if segment and not _matches_segment(event, profile, segment):
            continue
        counts[step] += 1

    result_steps: list[dict[str, Any]] = []
    bottleneck: str | None = None
    worst_drop = -1.0
    previous: int | None = None
    # product.reactive is a reactivation signal, not a sequential AARRR step.
    sequential = steps[:-1] if domain == "product" else steps
    for step in steps:
        count = counts[step]
        if step == "product.reactive":
            result_steps.append(
                {"step": step, "count": count, "conv_rate": None, "drop_off": None}
            )
            continue
        if previous is None:
            conv_rate, drop_off = 1.0, 0.0
        elif previous == 0:
            conv_rate, drop_off = 0.0, 0.0
        else:
            conv_rate = min(count / previous, 1.0)
            drop_off = 1.0 - conv_rate
        result_steps.append(
            {
                "step": step,
                "count": count,
                "conv_rate": round(conv_rate, 4),
                "drop_off": round(drop_off, 4),
            }
        )
        if step in sequential and previous is not None and drop_off > worst_drop:
            bottleneck, worst_drop = step, drop_off
        previous = count

    return {
        "steps": result_steps,
        "bottleneck_step": bottleneck,
        "channel_quality": _channel_quality(events, domain, segment, profile),
        "trend": _daily_trend(events, steps, segment, profile),
        "experiments": _experiment_breakdown(events, steps, segment, profile),
        **({"segment": segment} if segment else {}),
    }


def _eligible_events(
    events: list[dict[str, Any]],
    steps: tuple[str, ...],
    segment: dict[str, str] | None,
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    return [
        event
        for event in events
        if event.get("step") in steps
        and (not segment or _matches_segment(event, profile, segment))
    ]


def _channel_quality(
    events: list[dict[str, Any]],
    domain: str,
    segment: dict[str, str] | None,
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    # Acquisition-to-activation is an observable, comparable signal for every
    # funnel. Keep counts alongside the rate so small samples are interpretable.
    acquire_step = "product.acquire" if domain == "product" else f"{domain}.onboard"
    activate_step = "product.activate" if domain == "product" else DOMAIN_STEPS[domain][1]
    by_channel: dict[str, dict[str, int]] = defaultdict(lambda: {"acquire": 0, "activate": 0})
    for event in _eligible_events(events, (acquire_step, activate_step), segment, profile):
        channel = event.get("channel") or profile.get("acquire_channel") or "unknown"
        if event.get("step") == acquire_step:
            by_channel[channel]["acquire"] += 1
        else:
            by_channel[channel]["activate"] += 1
    return [
        {
            "channel": channel,
            "acquire_count": counts["acquire"],
            "activate_count": counts["activate"],
            "quality_score": round(counts["activate"] / counts["acquire"], 4)
            if counts["acquire"]
            else None,
        }
        for channel, counts in sorted(by_channel.items())
    ]


def _daily_trend(
    events: list[dict[str, Any]],
    steps: tuple[str, ...],
    segment: dict[str, str] | None,
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    totals: dict[tuple[str, str], int] = defaultdict(int)
    for event in _eligible_events(events, steps, segment, profile):
        raw_ts = event.get("ts")
        if not isinstance(raw_ts, str):
            continue
        try:
            day = datetime.fromisoformat(raw_ts).astimezone(UTC).date().isoformat()
        except ValueError:
            continue
        totals[(day, event["step"])] += 1
    return [
        {"date": day, "step": step, "count": count}
        for (day, step), count in sorted(totals.items())
    ]


def _experiment_breakdown(
    events: list[dict[str, Any]],
    steps: tuple[str, ...],
    segment: dict[str, str] | None,
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for event in _eligible_events(events, steps, segment, profile):
        experiment_id, variant = event.get("experiment_id"), event.get("variant")
        if isinstance(experiment_id, str) and experiment_id and isinstance(variant, str) and variant:
            groups[(experiment_id, variant)][event["step"]] += 1
    return [
        {
            "experiment_id": experiment_id,
            "variant": variant,
            "steps": [{"step": step, "count": counts[step]} for step in steps if counts[step]],
        }
        for (experiment_id, variant), counts in sorted(groups.items())
    ]


def _matches_segment(
    event: dict[str, Any], profile: dict[str, Any], segment: dict[str, str]
) -> bool:
    fallbacks = {
        "channel": "acquire_channel",
        "region": "region",
        "user_type": "user_type",
    }
    for key, expected in segment.items():
        actual = event.get(key)
        if actual is None:
            actual = profile.get(fallbacks[key])
        if actual != expected:
            return False
    return True
