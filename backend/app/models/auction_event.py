import uuid
from decimal import Decimal
from enum import Enum as PyEnum

from sqlalchemy import Enum, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AuctionEventType(str, PyEnum):
    NOMINATION = "nomination"
    BID = "bid"
    AWARD = "award"
    UNDO = "undo"


class AuctionEvent(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "auction_events"

    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False
    )
    event_type: Mapped[AuctionEventType] = mapped_column(
        Enum(AuctionEventType, name="auction_event_type_enum"), nullable=False
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)

    season = relationship("Season", back_populates="auction_events")
    team = relationship("Team")
    player = relationship("Player")
