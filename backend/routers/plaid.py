import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..dependencies.auth import get_current_user
from ..dependencies.integrations import get_classifier, get_notifier
from ..models.plaid_item import PlaidItem
from ..models.user import User
from ..ports.classifier import ClassifierPort
from ..ports.notifier import NotifierPort
from ..services import plaid_service

logger = logging.getLogger(__name__)

router = APIRouter()


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: str | None = None


class PlaidItemResponse(BaseModel):
    id: uuid.UUID
    institution_name: str | None
    last_synced_at: str | None
    created_at: str
    needs_reauth: bool = False

    model_config = {"from_attributes": True}


def _plaid_item_to_response(item: PlaidItem) -> "PlaidItemResponse":
    return PlaidItemResponse(
        id=item.id,
        institution_name=item.institution_name,
        last_synced_at=item.last_synced_at.isoformat() if item.last_synced_at else None,
        created_at=item.created_at.isoformat(),
        needs_reauth=bool(item.needs_reauth),
    )


class SyncResponse(BaseModel):
    added: int
    modified: int
    removed: int


class DemoBankAvailabilityResponse(BaseModel):
    available: bool


@router.post("/create-link-token", response_model=LinkTokenResponse)
async def create_link_token(user: User = Depends(get_current_user)):
    link_token = await plaid_service.create_link_token(user.id)
    return LinkTokenResponse(link_token=link_token)


@router.post("/items/{item_id}/update-link-token", response_model=LinkTokenResponse)
async def create_update_link_token(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mint a Plaid update-mode link token so the user can re-auth an existing item
    (typically after ITEM_LOGIN_REQUIRED). Only valid for personal items — subscriber
    items pointing at the shared demo source can't be re-auth'd per-user."""
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.id == item_id, PlaidItem.user_id == user.id)
    )
    plaid_item = result.scalar_one_or_none()
    if not plaid_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plaid item not found")
    if plaid_item.shared_source_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shared demo-bank items cannot be re-authenticated individually.",
        )
    access_token, _ = await plaid_service._get_access_token_for_item(db, plaid_item)
    link_token = await plaid_service.create_link_token(user.id, access_token=access_token)
    return LinkTokenResponse(link_token=link_token)


@router.get("/demo-bank/available", response_model=DemoBankAvailabilityResponse)
async def demo_bank_available(db: AsyncSession = Depends(get_db)):
    """Tell the frontend whether the shared demo-bank option can be offered."""
    source = await plaid_service.get_active_shared_source(db)
    return DemoBankAvailabilityResponse(available=source is not None)


@router.post("/connect-demo-bank", response_model=PlaidItemResponse)
async def connect_demo_bank(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    classifier: ClassifierPort = Depends(get_classifier),
    notifier: NotifierPort = Depends(get_notifier),
):
    """Subscribe the caller to the shared demo Plaid item.

    The subscriber gets their own PlaidItem row (and their own cloned accounts/transactions)
    backed by the shared sandbox access_token. Safe to call alongside a personal Plaid link —
    both can coexist on one user.
    """
    try:
        item = await plaid_service.subscribe_user_to_shared_source(
            db, user.id, classifier=classifier, notifier=notifier
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return _plaid_item_to_response(item)


@router.post("/exchange-token", response_model=PlaidItemResponse)
async def exchange_token(
    body: ExchangeTokenRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    classifier: ClassifierPort = Depends(get_classifier),
    notifier: NotifierPort = Depends(get_notifier),
):
    item = await plaid_service.exchange_public_token(
        db, user.id, body.public_token, body.institution_name
    )

    # Run initial sync immediately so the user sees transactions right away
    try:
        await plaid_service.sync_transactions(
            db, item, classifier=classifier, notifier=notifier
        )
    except Exception:
        # Don't fail the exchange if initial sync has issues — poller will retry.
        # Rollback the dirty session so the refresh below works cleanly.
        logger.warning(
            "Initial sync failed for plaid_item %s, poller will retry", item.id
        )
        await db.rollback()

    await db.refresh(item)
    return _plaid_item_to_response(item)


@router.get("/items", response_model=list[PlaidItemResponse])
async def list_items(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await plaid_service.get_user_plaid_items(db, user.id)
    return [_plaid_item_to_response(item) for item in items]


@router.post("/items/{item_id}/reconnected", response_model=SyncResponse)
async def mark_item_reconnected(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    classifier: ClassifierPort = Depends(get_classifier),
    notifier: NotifierPort = Depends(get_notifier),
):
    """Clear the needs_reauth flag after a successful Plaid update-mode Link flow
    and trigger an immediate sync."""
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.id == item_id, PlaidItem.user_id == user.id)
    )
    plaid_item = result.scalar_one_or_none()
    if not plaid_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plaid item not found")
    plaid_item.needs_reauth = False
    await db.commit()
    await db.refresh(plaid_item)
    counts = await plaid_service.sync_transactions(
        db, plaid_item, classifier=classifier, notifier=notifier
    )
    return SyncResponse(**counts)


@router.post("/sync/{item_id}", response_model=SyncResponse)
async def sync_item(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    classifier: ClassifierPort = Depends(get_classifier),
    notifier: NotifierPort = Depends(get_notifier),
):
    result = await db.execute(
        select(PlaidItem).where(
            PlaidItem.id == item_id, PlaidItem.user_id == user.id
        )
    )
    plaid_item = result.scalar_one_or_none()
    if not plaid_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plaid item not found")

    counts = await plaid_service.sync_transactions(
        db, plaid_item, classifier=classifier, notifier=notifier
    )
    return SyncResponse(**counts)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlaidItem).where(
            PlaidItem.id == item_id, PlaidItem.user_id == user.id
        )
    )
    plaid_item = result.scalar_one_or_none()
    if not plaid_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plaid item not found")

    await plaid_service.remove_plaid_item(db, plaid_item)
