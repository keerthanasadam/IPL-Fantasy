import uuid
from pydantic import BaseModel


class TeamUpdate(BaseModel):
    name: str | None = None
    owner_id: uuid.UUID | None = None


class TeamResponse(BaseModel):
    id: uuid.UUID
    season_id: uuid.UUID
    name: str
    draft_position: int
    owner_id: uuid.UUID | None
    budget: float
    points: float

    model_config = {"from_attributes": True}


class DraftOrderUpdate(BaseModel):
    order: list[uuid.UUID] | None = None
    randomize: bool = False
    seed: int | None = None
