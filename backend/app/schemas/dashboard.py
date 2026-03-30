from pydantic import BaseModel


class StandingEntry(BaseModel):
    rank: int
    team_name: str
    owner_name: str | None
    total_points: float


class BoundaryEntry(BaseModel):
    rank: int
    team_name: str
    owner_name: str | None
    total_fours: int
    total_sixes: int
    boundary_points: float


class CaptainVcEntry(BaseModel):
    rank: int
    team_name: str
    owner_name: str | None
    captain: str | None
    vice_captain: str | None
    total_points: float


class AwesomeThreesomeEntry(BaseModel):
    rank: int
    team_name: str
    owner_name: str | None
    batter: str | None
    bowler: str | None
    allrounder: str | None
    total_points: float


class PredictionEntry(BaseModel):
    team_name: str
    owner_name: str | None
    ipl_winner: str | None
    orange_cap: str | None
    purple_cap: str | None
    ipl_mvp: str | None


class PredictionActuals(BaseModel):
    ipl_winner: str | None = None
    orange_cap: list[str] | None = None
    purple_cap: list[str] | None = None
    ipl_mvp: str | None = None


class TopScorerEntry(BaseModel):
    player_name: str
    ipl_team: str | None
    designation: str | None
    total_points: float
    fantasy_team: str | None
    owner_name: str | None
    draft_round: int | None


class PlayerInRoster(BaseModel):
    player_name: str
    ipl_team: str | None
    designation: str | None
    total_points: float
    total_boundaries: int
    draft_round: int


class TeamRoster(BaseModel):
    team_name: str
    owner_name: str | None
    total_points: float
    players: list[PlayerInRoster]


class ScoreHistoryEntry(BaseModel):
    match_id: str
    match_label: str
    team_points: dict[str, float]  # team_name -> points earned this match


class DashboardResponse(BaseModel):
    league_name: str
    season_label: str
    last_updated: str | None
    matches_played: int
    standings: list[StandingEntry]
    boundary_pot: list[BoundaryEntry]
    captain_vc_pot: list[CaptainVcEntry]
    awesome_threesome_pot: list[AwesomeThreesomeEntry]
    predictions: list[PredictionEntry]
    prediction_actuals: PredictionActuals | None = None
    score_history: list[ScoreHistoryEntry] = []
    top_scorers: list[TopScorerEntry]
    rosters: list[TeamRoster]
