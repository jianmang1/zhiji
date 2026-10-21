from zhiji_cloudbase.funnel import make_funnel


def test_get_funnel_includes_channel_quality_daily_trend_and_ab_variants():
    events = [
        {"step": "product.acquire", "channel": "organic", "ts": "2026-10-20T12:00:00Z", "experiment_id": "landing-v1", "variant": "A"},
        {"step": "product.activate", "channel": "organic", "ts": "2026-10-20T13:00:00Z", "experiment_id": "landing-v1", "variant": "A"},
        {"step": "product.acquire", "channel": "ads", "ts": "2026-10-21T12:00:00Z", "experiment_id": "landing-v1", "variant": "B"},
    ]
    result = make_funnel(events, "product", None)
    assert result["channel_quality"] == [
        {"channel": "ads", "acquire_count": 1, "activate_count": 0, "quality_score": 0.0},
        {"channel": "organic", "acquire_count": 1, "activate_count": 1, "quality_score": 1.0},
    ]
    assert result["trend"] == [
        {"date": "2026-10-20", "step": "product.acquire", "count": 1},
        {"date": "2026-10-20", "step": "product.activate", "count": 1},
        {"date": "2026-10-21", "step": "product.acquire", "count": 1},
    ]
    assert result["experiments"] == [
        {"experiment_id": "landing-v1", "variant": "A", "steps": [
            {"step": "product.acquire", "count": 1},
            {"step": "product.activate", "count": 1},
        ]},
        {"experiment_id": "landing-v1", "variant": "B", "steps": [
            {"step": "product.acquire", "count": 1},
        ]},
    ]
