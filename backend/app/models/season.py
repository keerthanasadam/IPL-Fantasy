import uuid
from enum import Enum as PyEnum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class DraftFormat(str, PyEnum):
    SNAKE = "snake"
    AUCTION = "auction"


class SeasonStatus(str, PyEnum):
    SETUP = "setup"
    DRAFTING = "drafting"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Season(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "seasons"

    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leagues.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    draft_format: Mapped[DraftFormat] = mapped_column(
        Enum(DraftFormat, name="draft_format_enum"), nullable=False
    )
    team_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[SeasonStatus] = mapped_column(
        Enum(SeasonStatus, name="season_status_enum"), default=SeasonStatus.SETUP, nullable=False
    )
    draft_config: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    invite_code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)

    league = relationship("League", back_populates="seasons")
    teams = relationship("Team", back_populates="season", order_by="Team.draft_position")
    players = relationship("Player", back_populates="season")
    snake_picks = relationship("SnakePick", back_populates="season", order_by="SnakePick.pick_number")
    auction_events = relationship("AuctionEvent", back_populates="season", order_by="AuctionEvent.created_at")
