from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import Domain, GoalStatus


class WxLoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str


class EventCreate(BaseModel):
    domain: Domain
    type: str = Field(min_length=1, max_length=128)
    ts: datetime
    payload: dict[str, Any]
    source: str = Field(default="manual", min_length=1, max_length=128)


class EventRead(EventCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    domain: Domain


class GoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    domain: Domain
    status: GoalStatus
    created_at: datetime


class PlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    generated_by: str = Field(min_length=1, max_length=128)
    based_on: dict[str, Any] = Field(default_factory=dict)
    content: dict[str, Any]


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    generated_by: str
    based_on: dict[str, Any]
    content: dict[str, Any]
    created_at: datetime


class AnalyticsSummary(BaseModel):
    total_events: int
    by_domain: dict[str, int]
    latest_plan_at: datetime | None
