import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(levelname)s:  %(name)s  -  %(message)s")
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  # Ensure model metadata is registered for migrations/dev auto-create.
from .config import get_settings
from .database import Base, engine
from .routers.auth import router as auth_router
from .routers.counter import router as counter_router
from .routers.transactions import router as transactions_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_CREATE_TABLES:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Bank API",
    description="Banking application API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(counter_router, prefix="/api/counter", tags=["counter"])
app.include_router(transactions_router, prefix="/api/transactions", tags=["transactions"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
