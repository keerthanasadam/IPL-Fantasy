from pydantic import BaseModel


class CaptainVcPick(BaseModel):
    team_name: str
    captain: str
    vice_captain: str


class AwesomeThreesomePick(BaseModel):
    team_name: str
    batter: str
    bowler: str
    allrounder: str


class PredictionPick(BaseModel):
    team_name: str
    ipl_winner: str | None = None
    orange_cap: str | None = None
    purple_cap: str | None = None
    ipl_mvp: str | None = None


class TeamOwnerMapping(BaseModel):
    team_name: str
    owner_name: str


class SidePotsUpload(BaseModel):
    teams: list[TeamOwnerMapping]
    captain_vc_picks: list[CaptainVcPick]
    awesome_threesome: list[AwesomeThreesomePick]
    predictions: list[PredictionPick]


class ScrapeResult(BaseModel):
    matches_scraped: int
    players_updated: int
    unmatched_players: list[str]
    errors: list[str]
