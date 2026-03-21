from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://ipl:ipl_secret@localhost:5432/ipl_fantasy"
    DATABASE_URL_SYNC: str = "postgresql://ipl:ipl_secret@localhost:5432/ipl_fantasy"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    APP_ENV: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def fix_database_urls(self) -> "Settings":
        # Railway provides postgresql:// — asyncpg requires postgresql+asyncpg://
        if self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        # Ensure sync URL never has the asyncpg driver prefix
        if self.DATABASE_URL_SYNC.startswith("postgresql+asyncpg://"):
            self.DATABASE_URL_SYNC = self.DATABASE_URL_SYNC.replace(
                "postgresql+asyncpg://", "postgresql://", 1
            )
        return self


settings = Settings()
