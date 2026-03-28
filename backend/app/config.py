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

    # Auto-scrape schedule: comma-separated hours in 24h format (IST)
    # e.g. "1,13" means 1:00 AM and 1:00 PM IST daily
    SCRAPE_HOURS_IST: str = "1,13"
    # Season ID to auto-scrape (set this after league is created)
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
