from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import protect_event, reveal_event
from app.core.security import create_token_pair, get_current_user
from app.db.session import get_db
from app.models import Domain, Event, Goal, Plan, User
from app.repositories import Repository
from app.schemas.api import (
    AnalyticsSummary,
    EventCreate,
    EventRead,
    GoalCreate,
    GoalRead,
    PlanCreate,
    PlanRead,
    TokenResponse,
    WxLoginRequest,
)
from app.services import exchange_wx_code

router = APIRouter()


@router.post("/auth/wx-login", response_model=TokenResponse)
async def wx_login(data: WxLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    try:
        openid = await exchange_wx_code(data.code)
    except Exception as exc:
        raise HTTPException(
            400, {"code": "wx_login_failed", "message": "WeChat login failed"}
        ) from exc
    user = await Repository(db).upsert_user(openid)
    await db.commit()
    access, refresh, expires = create_token_pair(user.id)
    return TokenResponse(
        access_token=access, refresh_token=refresh, expires_in=expires, user_id=str(user.id)
    )


@router.get("/events", response_model=list[EventRead])
async def list_events(
    domain: Domain | None = None,
    start: datetime | None = Query(None, alias="from"),
    end: datetime | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Event]:
    if start and end and start > end:
        raise HTTPException(400, {"code": "invalid_range", "message": "from must be before to"})
    return [
        reveal_event(item)
        for item in await Repository(db).events(user.id, domain, start, end, limit)
    ]


@router.post("/events", response_model=EventRead, status_code=201)
async def create_event(
    data: EventCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Event:
    item = await Repository(db).create_event(user.id, data)
    protect_event(item)
    await db.commit()
    await db.refresh(item)
    return reveal_event(item)


async def require_event(repo: Repository, user_id: UUID, event_id: int) -> Event:
    item = await repo.event(user_id, event_id)
    if item is None:
        raise HTTPException(404, {"code": "not_found", "message": "Event not found"})
    return item


@router.get("/events/{event_id}", response_model=EventRead)
async def get_event(
    event_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Event:
    return reveal_event(await require_event(Repository(db), user.id, event_id))


@router.put("/events/{event_id}", response_model=EventRead)
async def update_event(
    event_id: int,
    data: EventCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Event:
    item = await require_event(Repository(db), user.id, event_id)
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    protect_event(item)
    await db.commit()
    await db.refresh(item)
    return reveal_event(item)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    item = await require_event(Repository(db), user.id, event_id)
    await db.delete(item)
    await db.commit()
    return Response(status_code=204)


@router.get("/goals", response_model=list[GoalRead])
async def list_goals(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[Goal]:
    return await Repository(db).goals(user.id)


@router.post("/goals", response_model=GoalRead, status_code=201)
async def create_goal(
    data: GoalCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Goal:
    item = Goal(user_id=user.id, **data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/plans", response_model=list[PlanRead])
async def list_plans(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[Plan]:
    return await Repository(db).plans(user.id)


@router.post("/plans", response_model=PlanRead, status_code=201)
async def create_plan(
    data: PlanCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Plan:
    item = Plan(user_id=user.id, **data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def summary(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> AnalyticsSummary:
    total, domains, latest = await Repository(db).summary(user.id)
    return AnalyticsSummary(total_events=total, by_domain=domains, latest_plan_at=latest)


@router.get("/analytics/domain/{domain}")
async def domain_summary(
    domain: Domain, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    return {
        "domain": domain.value,
        "total_events": sum(counts.values())
        if (counts := await Repository(db).domain_counts(user.id, domain))
        else 0,
        "by_type": counts,
    }
