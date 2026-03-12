import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class SeasonCreate(BaseModel):
    label: str = "IPL 2026"
    draft_format: str = "snake"
    team_count: int = Field(ge=2, le=20, default=8)
    draft_config: dict = Field(default_factory=lambda: {"rounds": 15, "timer_seconds": 0})


class SeasonUpdate(BaseModel):
    label: str | None = None
    draft_config: dict | None = None


class SeasonResponse(BaseModel):
    id: uuid.UUID
    league_id: uuid.UUID
    label: str
    draft_format: str
    team_count: int
    status: str
    draft_config: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SeasonDetail(SeasonResponse):
    teams: list["TeamResponse"] = []


class TeamResponse(BaseModel):
    id: uuid.UUID
    name: str
    draft_position: int
    owner_id: uuid.UUID | None
    budget: float

    model_config = {"from_attributes": True}
