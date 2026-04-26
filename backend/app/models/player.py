import uuid

from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Player(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "players"

    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    ipl_team: Mapped[str] = mapped_column(String(100), nullable=False)
    designation: Mapped[str] = mapped_column(String(50), nullable=False)
    ranking: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    points: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True, default=Decimal("0"))
    points_at_draft: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True, default=None)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, default=dict)

    season = relationship("Season", back_populates="players")
