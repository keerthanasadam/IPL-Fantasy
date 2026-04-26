from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://ipl:ipl_secret@localhost:5432/ipl_fantasy"
    DATABASE_URL_SYNC: str = ""  # always derived from DATABASE_URL in validator
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    APP_ENV: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173"

    # Cricbattle scraper
    CRICBATTLE_EMAIL: str = ""
    CRICBATTLE_PASSWORD: str = ""
    CRICBATTLE_LEAGUE_ID: str = "676423"

    # Auto-scrape schedule: comma-separated hours in 24h IST format
    # e.g. "12" means 12:xx IST daily
    SCRAPE_HOURS_IST: str = "13"
    # Minute within each hour to fire (EST). Default 15 → 1:15 PM EST
    SCRAPE_MINUTE_IST: int = 15
    # Comma-separated season IDs to scrape (both leagues). Replaces legacy SCRAPE_SEASON_ID.
    SCRAPE_SEASON_IDS: str = ""
    # Legacy single season ID (kept for backward compat; ignored if SCRAPE_SEASON_IDS is set)
    SCRAPE_SEASON_ID: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def fix_database_urls(self) -> "Settings":
        # Railway provides postgresql:// — asyncpg requires postgresql+asyncpg://
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        # Always derive sync URL from the (now-fixed) async URL
        self.DATABASE_URL_SYNC = self.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql://", 1
        )
        return self


settings = Settings()
