import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class League(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "leagues"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    commissioner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    commissioner = relationship("User", back_populates="leagues")
    seasons = relationship("Season", back_populates="league", order_by="Season.created_at.desc()")
