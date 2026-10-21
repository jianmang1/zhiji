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
        **({"segment": segment} if segment else {}),
    }


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
