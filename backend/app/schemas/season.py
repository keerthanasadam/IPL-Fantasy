import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.league import LeagueResponse


class RoleLimitConfig(BaseModel):
    min: int = Field(default=0, ge=0)
    max: int = Field(default=99, ge=0)


class DraftConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    rounds: int = Field(default=15, ge=1)
    pick_timer_seconds: int = Field(default=0, ge=0)
    scheduled_draft_time: str | None = None
    on_timeout: Literal["auto_pick", "skip_turn"] = "auto_pick"
    role_limits: dict[str, RoleLimitConfig] = Field(default_factory=dict)


class SeasonCreate(BaseModel):
    label: str = "IPL 2026"
    draft_format: str = "snake"
    team_count: int = Field(ge=2, le=20, default=8)
    draft_config: DraftConfig = Field(default_factory=DraftConfig)


class SeasonUpdate(BaseModel):
    label: str | None = None
    draft_config: DraftConfig | None = None


class SeasonResponse(BaseModel):
    id: uuid.UUID
    league_id: uuid.UUID
    label: str
    draft_format: str
    team_count: int
    status: str
    draft_config: dict | None
    invite_code: str | None
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
    points: float

    model_config = {"from_attributes": True}


class SeasonJoinRequest(BaseModel):
    invite_code: str
    team_name: str = Field(min_length=1, max_length=50)

    @field_validator("team_name")
    @classmethod
    def team_name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Team name cannot be blank")
        return v.strip()


class SeasonJoinResponse(BaseModel):
    model_config = {"from_attributes": True}
    team: "TeamResponse"
    season: SeasonResponse
    league: LeagueResponse
