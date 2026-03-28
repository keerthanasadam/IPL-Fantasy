import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class PlayerMatchScore(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "player_match_scores"
    __table_args__ = (
        UniqueConstraint("player_id", "match_id", name="uq_player_match"),
    )

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id"), nullable=False
    )
    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False
    )
    match_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    match_label: Mapped[str] = mapped_column(String(200), nullable=False)
    points: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    fours: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sixes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    player = relationship("Player")
    season = relationship("Season")
