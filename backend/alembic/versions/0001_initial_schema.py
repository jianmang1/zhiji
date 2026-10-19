"""Create initial users, events, tags, goals, and plans tables."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None
domain = postgresql.ENUM(
    "health", "work", "consumption", "capability", "interest", name="domain_enum", create_type=False
)
goal_status = postgresql.ENUM(
    "active", "done", "dropped", name="goal_status_enum", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    domain.create(bind, checkfirst=True)
    goal_status.create(bind, checkfirst=True)
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("openid", sa.String(128), nullable=False, unique=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_users_openid", "users", ["openid"], unique=True)
    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("domain", domain, nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_events_user_ts", "events", ["user_id", "ts"])
    op.create_index("ix_events_domain", "events", ["domain"])
    op.create_table(
        "tags",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "event_id",
            sa.BigInteger(),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tag", sa.String(128), nullable=False),
    )
    op.create_index("ix_tags_tag", "tags", ["tag"])
    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("domain", domain, nullable=False),
        sa.Column("status", goal_status, nullable=False, server_default="active"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_goals_user_id", "goals", ["user_id"])
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("generated_by", sa.Text(), nullable=False),
        sa.Column("based_on", postgresql.JSONB(), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_plans_user_id", "plans", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_plans_user_id", table_name="plans")
    op.drop_table("plans")
    op.drop_index("ix_goals_user_id", table_name="goals")
    op.drop_table("goals")
    op.drop_index("ix_tags_tag", table_name="tags")
    op.drop_table("tags")
    op.drop_index("ix_events_domain", table_name="events")
    op.drop_index("ix_events_user_ts", table_name="events")
    op.drop_table("events")
    op.drop_index("ix_users_openid", table_name="users")
    op.drop_table("users")
    goal_status.drop(op.get_bind(), checkfirst=True)
    domain.drop(op.get_bind(), checkfirst=True)
