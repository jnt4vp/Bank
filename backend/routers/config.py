"""Public app-config endpoint — non-sensitive runtime flags the frontend needs.

Exposed without auth so the login/landing pages can check them too. Only put
things here that we're comfortable being visible in an unauthenticated network tab.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_settings
from ..version import APP_VERSION

router = APIRouter()


class AppConfigResponse(BaseModel):
    plaid_env: str
    simulated_transfers_enabled: bool
    app_version: str


@router.get("", response_model=AppConfigResponse)
async def get_app_config() -> AppConfigResponse:
    settings = get_settings()
    return AppConfigResponse(
        plaid_env=settings.PLAID_ENV,
        simulated_transfers_enabled=settings.SIMULATED_TRANSFERS_ENABLED,
        app_version=APP_VERSION,
    )
