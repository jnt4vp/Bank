import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, ProgrammingError

from .config import get_settings
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  # Ensure model metadata is registered for migrations/dev auto-create.
from .database import Base, async_session, engine
from .routers.auth import router as auth_router
from .routers.counter import router as counter_router
from .routers.plaid import router as plaid_router
from .routers.transactions import router as transactions_router
from .application.auth import ensure_dev_seed_user_exists
from .routers.accountability_settings import router as accountability_settings_router
from .routers.accountability_partners import router as accountability_partners_router
from .routers.goals import router as goals_router
from .routers.pact import router as pact_router
from .routers.simulated_savings_transfers import router as simulated_savings_transfers_router
from .models.plaid_item import PlaidItem
from .models.pact import Pact
from .services.plaid_poller import start_poller, stop_poller
from .services.plaid_service import (
    ensure_shared_demo_source,
    seed_sandbox_plaid_item,
    sync_transactions,
)
from .dependencies.integrations import get_classifier, get_notifier

settings = get_settings()


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s:  %(name)s  -  %(message)s",
    )

    if settings.APP_ENV == "development":
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)


_configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_CREATE_TABLES:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        user = await ensure_dev_seed_user_exists(session)

    # Seed default pacts for the dev user so the dashboard has data
    if user:
        try:
            async with async_session() as session:
                from sqlalchemy import select
                existing = await session.execute(
                    select(Pact).where(Pact.user_id == user.id).limit(1)
                )
                if not existing.scalar_one_or_none():
                    session.add(Pact(
                        user_id=user.id,
                        preset_category="Coffee Shops",
                        category="Coffee Shops",
                        status="active",
                    ))
                    session.add(Pact(
                        user_id=user.id,
                        preset_category="Fast Food",
                        category="Fast Food",
                        status="active",
                    ))
                    await session.commit()
                    logging.getLogger(__name__).info("Seeded 2 default pacts for dev user")
        except Exception:
            logging.getLogger(__name__).warning("Failed to seed default pacts", exc_info=True)

    # Provision the shared demo Plaid source once per deploy so new users can pick
    # "demo bank" at signup regardless of whether the main Plaid env is sandbox or production.
    try:
        async with async_session() as session:
            await ensure_shared_demo_source(session)
    except Exception:
        logging.getLogger(__name__).warning(
            "Failed to provision shared demo Plaid source — demo-bank option will be unavailable",
            exc_info=True,
        )

    # Seed a sandbox Plaid connection for the dev user so login works out-of-the-box
    if user:
        try:
            async with async_session() as session:
                plaid_item = await seed_sandbox_plaid_item(session, user.id)
            if plaid_item:
                async with async_session() as session:
                    refreshed = await session.get(PlaidItem, plaid_item.id)
                    if refreshed:
                        await sync_transactions(
                            session,
                            refreshed,
                            classifier=get_classifier(),
                            notifier=get_notifier(),
                        )
        except Exception:
            logging.getLogger(__name__).warning(
                "Sandbox Plaid seed failed — Plaid credentials may be missing or invalid",
                exc_info=True,
            )

    start_poller()
    yield
    stop_poller()


app = FastAPI(
    title="Bank API",
    description="Banking application API",
    version="1.0.0",
    lifespan=lifespan
)

_DB_SETUP_HINT = (
    "Database is empty or schema is behind the code. From the project root run: "
    "./.venv/bin/alembic -c alembic.ini upgrade head "
    "(Postgres must be running, e.g. docker compose up -d)."
)


@app.exception_handler(ProgrammingError)
async def _programming_error_handler(_request: Request, exc: ProgrammingError):
    inner = getattr(exc, "orig", None) or exc
    text = str(inner)
    if "does not exist" in text or "UndefinedTable" in text:
        logging.getLogger(__name__).warning("DB schema missing or stale: %s", text)
        return JSONResponse(status_code=503, content={"detail": _DB_SETUP_HINT})
    logging.getLogger(__name__).exception("ProgrammingError: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error (database)."},
    )


@app.exception_handler(OperationalError)
async def _operational_error_handler(_request: Request, exc: OperationalError):
    logging.getLogger(__name__).warning("DB connection issue: %s", exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Cannot reach the database. Start Postgres (docker compose up -d) and check DATABASE_URL."
        },
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
app.include_router(plaid_router, prefix="/api/plaid", tags=["plaid"])
app.include_router(
    accountability_settings_router,
    prefix="/api/accountability-settings",
    tags=["accountability-settings"],
)
app.include_router(
    accountability_partners_router,
    prefix="/api/accountability-partners",
    tags=["accountability-partners"],
)
app.include_router(goals_router, prefix="/api/goals", tags=["goals"])
app.include_router(pact_router, tags=["pacts"])
app.include_router(
    simulated_savings_transfers_router,
    prefix="/api/simulated-savings-transfers",
    tags=["simulated-savings-transfers"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
