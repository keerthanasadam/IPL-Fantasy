import uuid
from pydantic import BaseModel


class PlayerResponse(BaseModel):
    id: uuid.UUID
    season_id: uuid.UUID
    name: str
    ipl_team: str
    designation: str
    ranking: int | None = None
    points: float | None = None

    model_config = {"from_attributes": True}


class PlayerListResponse(BaseModel):
    players: list[PlayerResponse]
    total: int


class ImportResult(BaseModel):
    imported: int
    updated: int = 0
    skipped: int
    errors: list[str]
