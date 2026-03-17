import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(levelname)s:  %(name)s  -  %(message)s")
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  # Ensure model metadata is registered for migrations/dev auto-create.
from .config import get_settings
from .database import Base, async_session, engine
from .routers.auth import router as auth_router
from .routers.counter import router as counter_router
from .routers.plaid import router as plaid_router
from .routers.transactions import router as transactions_router
from .application.auth import ensure_dev_seed_user_exists
from .routers.accountability_settings import router as accountability_settings_router
from .routers.pact import router as pact_router
from .models.plaid_item import PlaidItem
from .services.plaid_poller import start_poller, stop_poller
from .services.plaid_service import seed_sandbox_plaid_item, sync_transactions
from .dependencies.integrations import get_classifier, get_notifier

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_CREATE_TABLES:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        user = await ensure_dev_seed_user_exists(session)

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
app.include_router(pact_router, tags=["pacts"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}