from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Event, Goal, Plan, User
from app.schemas.api import EventCreate


class Repository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def upsert_user(self, openid: str) -> User:
        result = await self.db.execute(select(User).where(User.openid == openid))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(openid=openid)
            self.db.add(user)
            await self.db.flush()
        return user

    async def events(
        self,
        user_id: UUID,
        domain: Domain | None,
        start: datetime | None,
        end: datetime | None,
        limit: int,
    ) -> list[Event]:
        query = select(Event).where(Event.user_id == user_id)
        if domain is not None:
            query = query.where(Event.domain == domain)
        if start is not None:
            query = query.where(Event.ts >= start)
        if end is not None:
            query = query.where(Event.ts <= end)
        result = await self.db.scalars(query.order_by(Event.ts.desc()).limit(limit))
        return list(result.all())

    async def event(self, user_id: UUID, event_id: int) -> Event | None:
        result = await self.db.scalars(
            select(Event).where(Event.id == event_id, Event.user_id == user_id)
        )
        return result.one_or_none()

    async def create_event(self, user_id: UUID, data: EventCreate) -> Event:
        event = Event(user_id=user_id, **data.model_dump())
        self.db.add(event)
        await self.db.flush()
        return event

    async def goals(self, user_id: UUID) -> list[Goal]:
        return list(
            (
                await self.db.scalars(
                    select(Goal).where(Goal.user_id == user_id).order_by(Goal.created_at.desc())
                )
            ).all()
        )

    async def plans(self, user_id: UUID) -> list[Plan]:
        return list(
            (
                await self.db.scalars(
                    select(Plan).where(Plan.user_id == user_id).order_by(Plan.created_at.desc())
                )
            ).all()
        )

    async def summary(self, user_id: UUID) -> tuple[int, dict[str, int], datetime | None]:
        total = (
            await self.db.scalar(select(func.count(Event.id)).where(Event.user_id == user_id)) or 0
        )
        rows = (
            await self.db.execute(
                select(Event.domain, func.count(Event.id))
                .where(Event.user_id == user_id)
                .group_by(Event.domain)
            )
        ).all()
        latest = await self.db.scalar(
            select(func.max(Plan.created_at)).where(Plan.user_id == user_id)
        )
        return int(total), {domain.value: int(count) for domain, count in rows}, latest

    async def domain_counts(self, user_id: UUID, domain: Domain) -> dict[str, int]:
        rows = (
            await self.db.execute(
                select(Event.type, func.count(Event.id))
                .where(Event.user_id == user_id, Event.domain == domain)
                .group_by(Event.type)
            )
        ).all()
        return {event_type: int(count) for event_type, count in rows}
