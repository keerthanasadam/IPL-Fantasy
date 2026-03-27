import uuid
from datetime import datetime
from pydantic import BaseModel


class LeagueCreate(BaseModel):
    name: str


class LeagueResponse(BaseModel):
    id: uuid.UUID
    name: str
    commissioner_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class LeagueDetail(LeagueResponse):
    seasons: list["SeasonSummary"] = []


class SeasonSummary(BaseModel):
    id: uuid.UUID
    label: str
    draft_format: str
    team_count: int
    status: str
    invite_code: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamInLeagueMine(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    name: str
    draft_position: int
    points: float


class SeasonInLeagueMine(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    label: str
    status: str
    team_count: int
    teams_joined: int
    invite_code: str | None
    draft_config: dict | None = None
    my_team: TeamInLeagueMine | None


class LeagueMineResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    name: str
    user_role: str  # "commissioner" | "member"
    seasons: list[SeasonInLeagueMine]
