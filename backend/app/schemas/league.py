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
    created_at: datetime

    model_config = {"from_attributes": True}
