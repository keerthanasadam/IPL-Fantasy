import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SidePotConfig(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "side_pot_configs"
    __table_args__ = (
        UniqueConstraint("team_id", "pot_type", name="uq_team_pot_type"),
    )

    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False
    )
    pot_type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    season = relationship("Season")
    team = relationship("Team")
