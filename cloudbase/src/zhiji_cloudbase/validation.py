from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Domain = Literal["health", "work", "dating"]


class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    domain: Domain
    type: str = Field(min_length=1, max_length=128)
    ts: datetime
    payload: dict[str, Any]
    source: str = Field(default="manual", min_length=1, max_length=128)

    @field_validator("ts")
    @classmethod
    def timestamp_must_include_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("ts must include a timezone")
        return value


class ListEventsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    domain: Domain | None = None
    range: dict[str, Any] | None = None
    limit: int = Field(default=50, ge=1, le=200)

    @field_validator("range")
    @classmethod
    def validate_range(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        if set(value) - {"from", "to"}:
            raise ValueError("range supports only from and to")
        start, end = parse_time(value.get("from")), parse_time(value.get("to"))
        if start and end and start > end:
            raise ValueError("range.from must not be after range.to")
        return value


def parse_time(value: Any) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("range timestamps must be ISO 8601 strings")
    try:
        result = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("range timestamps must be ISO 8601 strings") from exc
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("range timestamps must include a timezone")
    return result


class GeneratePlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    based_on: dict[str, Any] = Field(min_length=1)

    @field_validator("based_on")
    @classmethod
    def validate_based_on(cls, value: dict[str, Any]) -> dict[str, Any]:
        list_input = ListEventsInput.model_validate(
            {key: value[key] for key in ("domain", "range") if key in value}
        )
        if set(value) - {"domain", "range"}:
            raise ValueError("based_on supports only domain and range filters")
        if value.get("domain") and list_input.domain is None:
            raise ValueError("based_on.domain is invalid")
        if value.get("range") is not None and list_input.range is None:
            raise ValueError("based_on.range is invalid")
        return value
