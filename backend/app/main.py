from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.services.scheduler import start_scheduler, stop_scheduler
from app.routers import auth as auth_router
from app.routers import leagues as leagues_router
from app.routers import seasons as seasons_router
from app.routers import teams as teams_router
from app.routers import players as players_router
from app.routers import draft as draft_router
from app.routers import public as public_router
from app.routers import scores as scores_router
from app.ws import snake_ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create DB engine and Redis pool
    app.state.engine = create_async_engine(settings.DATABASE_URL, echo=(settings.APP_ENV == "development"))
    app.state.async_session = async_sessionmaker(app.state.engine, class_=AsyncSession, expire_on_commit=False)
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    start_scheduler()
    yield
    # Shutdown: close connections
    stop_scheduler()
    await app.state.redis.aclose()
    await app.state.engine.dispose()


app = FastAPI(title="IPL Fantasy League", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router.router)
app.include_router(leagues_router.router)
app.include_router(seasons_router.router)
app.include_router(teams_router.router)
app.include_router(players_router.router)
app.include_router(draft_router.router)
app.include_router(public_router.router)
app.include_router(scores_router.router)
app.include_router(snake_ws.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
