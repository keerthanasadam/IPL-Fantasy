import uuid
from pydantic import BaseModel


class PlayerResponse(BaseModel):
    id: uuid.UUID
    season_id: uuid.UUID
    name: str
    ipl_team: str
    designation: str

    model_config = {"from_attributes": True}


class PlayerListResponse(BaseModel):
    players: list[PlayerResponse]
    total: int


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
