import asyncio
import logging
import uuid
from datetime import datetime, timezone
from functools import partial

import httpx
import plaid
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.item_remove_request import ItemRemoveRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.sandbox_public_token_create_request_options import (
    SandboxPublicTokenCreateRequestOptions,
)
from plaid.model.sandbox_public_token_create_request_options_transactions import (
    SandboxPublicTokenCreateRequestOptionsTransactions,
)
from plaid.model.transactions_refresh_request import TransactionsRefreshRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.transactions_sync_request_options import TransactionsSyncRequestOptions
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.account import Account
from ..models.plaid_item import PlaidItem
from ..models.transaction import Transaction
from ..models.user import User
from ..services.discipline import ensure_discipline_window_after_plaid_sync
from ..ports.classifier import ClassifierPort
from ..ports.notifier import NotifierPort
from ..repositories.pacts import get_active_pact_categories
from ..services.classifier import classify_transaction
from ..services.accountability_alerts import send_accountability_alerts_for_transaction
from ..services.simulated_savings_transfers import (
    record_simulated_savings_transfers_for_transaction,
)
from ..services.token_encryption import decrypt_token, encrypt_token
from .plaid_category_resolution import resolved_plaid_category

logger = logging.getLogger(__name__)

PLAID_ENV_MAP = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}


def _get_plaid_client() -> plaid_api.PlaidApi:
    settings = get_settings()
    configuration = plaid.Configuration(
        host=PLAID_ENV_MAP[settings.PLAID_ENV],
        api_key={
            "clientId": settings.PLAID_CLIENT_ID,
            "secret": settings.PLAID_SECRET,
        },
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


_client: plaid_api.PlaidApi | None = None


def get_plaid_client() -> plaid_api.PlaidApi:
    global _client
    if _client is None:
        _client = _get_plaid_client()
    return _client


def _get_access_token(plaid_item: PlaidItem) -> str:
    """Decrypt the stored access token. Handles both encrypted and legacy plaintext tokens."""
    try:
        return decrypt_token(plaid_item.access_token)
    except Exception:
        # Legacy plaintext token (pre-encryption migration)
        return plaid_item.access_token


# ---------------------------------------------------------------------------
# Async wrappers for blocking Plaid SDK calls
# ---------------------------------------------------------------------------

async def _call_plaid(func, *args, **kwargs):
    """Run a synchronous Plaid SDK call in a thread so we don't block the event loop."""
    return await asyncio.to_thread(partial(func, *args, **kwargs))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def create_link_token(user_id: uuid.UUID) -> str:
    client = get_plaid_client()
    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="PactBank",
        country_codes=[CountryCode("US")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id=str(user_id)),
    )
    response = await _call_plaid(client.link_token_create, request)
    return response.link_token


async def _touch_bank_connected_at(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Record first successful Plaid link; idempotent."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.bank_connected_at is not None:
        return
    user.bank_connected_at = datetime.now(timezone.utc)
    await db.commit()


async def exchange_public_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    public_token: str,
    institution_name: str | None = None,
) -> PlaidItem:
    client = get_plaid_client()
    response = await _call_plaid(
        client.item_public_token_exchange,
        ItemPublicTokenExchangeRequest(public_token=public_token),
    )

    # Check for an existing item with this item_id (re-link / retry scenario)
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.item_id == response.item_id)
    )
    plaid_item = result.scalar_one_or_none()

    if plaid_item:
        # Update existing item with fresh token
        plaid_item.access_token = encrypt_token(response.access_token)
        plaid_item.institution_name = institution_name or plaid_item.institution_name
        logger.info("Plaid item %s re-linked for user %s", plaid_item.id, user_id)
    else:
        plaid_item = PlaidItem(
            user_id=user_id,
            item_id=response.item_id,
            access_token=encrypt_token(response.access_token),
            institution_name=institution_name,
        )
        db.add(plaid_item)
        logger.info("Plaid item created for user %s", user_id)

    await db.commit()
    await db.refresh(plaid_item)

    await _touch_bank_connected_at(db, user_id)

    # Fetch and store accounts for this item
    await _sync_accounts(db, plaid_item)

    return plaid_item


async def _sync_accounts(db: AsyncSession, plaid_item: PlaidItem) -> None:
    """Fetch accounts from Plaid and upsert into the accounts table."""
    client = get_plaid_client()

    try:
        response = await _call_plaid(
            client.accounts_get,
            AccountsGetRequest(access_token=_get_access_token(plaid_item)),
        )
    except Exception:
        logger.exception("Failed to fetch accounts for plaid_item %s", plaid_item.id)
        return

    for acct in response.accounts:
        existing = await db.execute(
            select(Account).where(Account.plaid_account_id == acct.account_id)
        )
        existing_acct = existing.scalar_one_or_none()

        balances = acct.balances
        if existing_acct:
            existing_acct.current_balance = balances.current
            existing_acct.available_balance = balances.available
            existing_acct.iso_currency_code = balances.iso_currency_code
            existing_acct.name = acct.name
            existing_acct.official_name = acct.official_name
        else:
            db.add(
                Account(
                    plaid_item_id=plaid_item.id,
                    user_id=plaid_item.user_id,
                    plaid_account_id=acct.account_id,
                    name=acct.name,
                    official_name=acct.official_name,
                    type=acct.type.value if hasattr(acct.type, "value") else str(acct.type),
                    subtype=acct.subtype.value if acct.subtype and hasattr(acct.subtype, "value") else (str(acct.subtype) if acct.subtype else None),
                    mask=acct.mask,
                    current_balance=balances.current,
                    available_balance=balances.available,
                    iso_currency_code=balances.iso_currency_code,
                )
            )

    await db.commit()


async def _resolve_account_id(
    db: AsyncSession, plaid_account_id: str | None
) -> uuid.UUID | None:
    """Look up our internal account UUID from a Plaid account_id string."""
    if not plaid_account_id:
        return None
    result = await db.execute(
        select(Account.id).where(Account.plaid_account_id == plaid_account_id)
    )
    row = result.scalar_one_or_none()
    return row


async def _process_added_transaction(
    db: AsyncSession,
    txn,
    *,
    user_id: uuid.UUID,
    classifier: ClassifierPort | None,
    notifier: NotifierPort | None,
    user_email: str | None,
    user_categories: list[str] | None,
    is_initial_backfill: bool,
    card_locked: bool = False,
) -> bool:
    """Handle a single added Plaid transaction. Returns True if a new row was inserted."""
    existing = await db.execute(
        select(Transaction).where(
            Transaction.plaid_transaction_id == txn.transaction_id
        )
    )
    if existing.scalar_one_or_none():
        return False

    account_id = await _resolve_account_id(db, txn.account_id)
    plaid_original_description = txn.original_description or None
    merchant = txn.merchant_name or txn.name or "Unknown"
    description = txn.name or plaid_original_description or ""
    amount = float(txn.amount)

    category = resolved_plaid_category(merchant, description, txn)
    flagged = False
    flag_reason = None

    if classifier:
        try:
            classification = await classify_transaction(
                classifier,
                merchant=merchant,
                description=description,
                amount=amount,
                user_categories=user_categories,
            )
            if classification.category:
                category = classification.category
            flagged = classification.flagged
            flag_reason = classification.flag_reason
        except Exception:
            logger.warning(
                "Classification failed for plaid txn %s, storing without flag",
                txn.transaction_id,
            )

    if card_locked and not is_initial_backfill:
        flagged = True
        flag_reason = "card_was_locked"

    new_txn = Transaction(
        user_id=user_id,
        merchant=merchant,
        description=description,
        amount=amount,
        category=category,
        flagged=flagged,
        flag_reason=flag_reason,
        plaid_transaction_id=txn.transaction_id,
        plaid_original_description=plaid_original_description,
        account_id=account_id,
        pending=txn.pending,
        date=txn.date,
    )
    db.add(new_txn)
    await db.flush()

    await record_simulated_savings_transfers_for_transaction(
        db,
        user_id=user_id,
        transaction=new_txn,
        skip_for_initial_plaid_backfill=is_initial_backfill,
    )

    if flagged and notifier and not is_initial_backfill:
        try:
            await notifier.send_transaction_alert(
                to_email=user_email,
                merchant=merchant,
                amount=amount,
                category=category,
                flag_reason=flag_reason,
            )
            new_txn.alert_sent = True
            new_txn.alert_sent_at = datetime.now(timezone.utc)
        except Exception:
            logger.warning("Failed to send alert for plaid txn %s", txn.transaction_id)

        try:
            await send_accountability_alerts_for_transaction(
                db,
                notifier=notifier,
                transaction=new_txn,
                user_id=user_id,
            )
        except Exception:
            logger.warning(
                "Failed to send accountability alerts for plaid txn %s",
                txn.transaction_id,
            )

    return True


async def _process_modified_transaction(
    db: AsyncSession,
    txn,
    *,
    user_id: uuid.UUID,
    notifier: NotifierPort | None,
    user_email: str | None,
    is_initial_backfill: bool,
) -> bool:
    """Handle a single modified Plaid transaction. Returns True if an existing row was updated."""
    result = await db.execute(
        select(Transaction).where(
            Transaction.plaid_transaction_id == txn.transaction_id
        )
    )
    existing_txn = result.scalar_one_or_none()
    if not existing_txn:
        return False

    was_flagged = bool(existing_txn.flagged)
    plaid_original_description = txn.original_description or None
    existing_txn.merchant = txn.merchant_name or txn.name or existing_txn.merchant
    existing_txn.description = txn.name or plaid_original_description or existing_txn.description
    existing_txn.plaid_original_description = plaid_original_description
    existing_txn.amount = float(txn.amount)
    existing_txn.pending = txn.pending
    existing_txn.date = txn.date
    new_cat = resolved_plaid_category(
        existing_txn.merchant, existing_txn.description, txn
    )
    if new_cat:
        existing_txn.category = new_cat
    if existing_txn.account_id is None and txn.account_id:
        existing_txn.account_id = await _resolve_account_id(db, txn.account_id)

    if (
        notifier
        and existing_txn.flagged
        and not was_flagged
        and not existing_txn.alert_sent
        and not is_initial_backfill
    ):
        try:
            await notifier.send_transaction_alert(
                to_email=user_email,
                merchant=existing_txn.merchant,
                amount=float(existing_txn.amount),
                category=existing_txn.category,
                flag_reason=existing_txn.flag_reason,
            )
            existing_txn.alert_sent = True
            existing_txn.alert_sent_at = datetime.now(timezone.utc)
        except Exception:
            logger.warning(
                "Failed to send alert for modified plaid txn %s",
                txn.transaction_id,
            )
    if (
        notifier
        and existing_txn.flagged
        and not existing_txn.accountability_alert_sent
        and not is_initial_backfill
    ):
        try:
            await send_accountability_alerts_for_transaction(
                db,
                notifier=notifier,
                transaction=existing_txn,
                user_id=user_id,
            )
        except Exception:
            logger.warning(
                "Failed accountability alerts for modified plaid txn %s",
                txn.transaction_id,
            )

    return True


async def _process_removed_transactions(
    db: AsyncSession,
    removed_txns: list,
) -> int:
    """Delete local rows for Plaid-removed transactions. Returns count of deleted rows."""
    removed_count = 0
    for txn in removed_txns:
        result = await db.execute(
            select(Transaction).where(
                Transaction.plaid_transaction_id == txn.transaction_id
            )
        )
        existing_txn = result.scalar_one_or_none()
        if existing_txn:
            await db.delete(existing_txn)
            removed_count += 1
    return removed_count


async def _gather_sync_context(
    db: AsyncSession,
    plaid_item: PlaidItem,
    notifier: NotifierPort | None,
) -> tuple[str | None, list[str] | None, bool]:
    """Fetch the user_email, active pact categories, and card_locked flag for a sync cycle."""
    user_email: str | None = None
    if notifier:
        result = await db.execute(
            select(User.email).where(User.id == plaid_item.user_id)
        )
        user_email = result.scalar_one_or_none()

    lock_result = await db.execute(
        select(User.card_locked).where(User.id == plaid_item.user_id)
    )
    card_locked = bool(lock_result.scalar_one_or_none())

    user_categories = await get_active_pact_categories(db, plaid_item.user_id) or None
    return user_email, user_categories, card_locked


async def _process_sync_page(
    db: AsyncSession,
    response,
    *,
    user_id: uuid.UUID,
    classifier: ClassifierPort | None,
    notifier: NotifierPort | None,
    user_email: str | None,
    user_categories: list[str] | None,
    is_initial_backfill: bool,
    card_locked: bool = False,
) -> tuple[int, int, int]:
    """Process one /transactions/sync response page. Returns (added, modified, removed) counts."""
    added = 0
    modified = 0
    for txn in response.added:
        if await _process_added_transaction(
            db, txn,
            user_id=user_id,
            classifier=classifier,
            notifier=notifier,
            user_email=user_email,
            user_categories=user_categories,
            is_initial_backfill=is_initial_backfill,
            card_locked=card_locked,
        ):
            added += 1

    for txn in response.modified:
        if await _process_modified_transaction(
            db, txn,
            user_id=user_id,
            notifier=notifier,
            user_email=user_email,
            is_initial_backfill=is_initial_backfill,
        ):
            modified += 1

    removed = await _process_removed_transactions(db, response.removed)
    return added, modified, removed


async def sync_transactions(
    db: AsyncSession,
    plaid_item: PlaidItem,
    *,
    classifier: ClassifierPort | None = None,
    notifier: NotifierPort | None = None,
) -> dict:
    """Run /transactions/sync for a single PlaidItem. Returns counts of added/modified/removed."""
    client = get_plaid_client()
    is_initial_backfill = (
        plaid_item.transaction_cursor is None and plaid_item.last_synced_at is None
    )

    await _sync_accounts(db, plaid_item)
    user_email, user_categories, card_locked = await _gather_sync_context(
        db, plaid_item, notifier
    )

    cursor = plaid_item.transaction_cursor
    added_count = 0
    modified_count = 0
    removed_count = 0
    has_more = True

    while has_more:
        request = TransactionsSyncRequest(
            access_token=_get_access_token(plaid_item),
            options=TransactionsSyncRequestOptions(
                include_original_description=True,
                include_personal_finance_category=True,
            ),
            **({"cursor": cursor} if cursor else {}),
        )
        response = await _call_plaid(client.transactions_sync, request)

        a, m, r = await _process_sync_page(
            db, response,
            user_id=plaid_item.user_id,
            classifier=classifier,
            notifier=notifier,
            user_email=user_email,
            user_categories=user_categories,
            is_initial_backfill=is_initial_backfill,
            card_locked=card_locked,
        )
        added_count += a
        modified_count += m
        removed_count += r

        has_more = response.has_more
        cursor = response.next_cursor

    await ensure_discipline_window_after_plaid_sync(db, plaid_item.user_id)

    plaid_item.transaction_cursor = cursor
    plaid_item.last_synced_at = datetime.now(timezone.utc)
    await db.commit()

    if added_count or modified_count or removed_count:
        logger.info(
            "Plaid sync  |  item=%s  |  added=%d  |  modified=%d  |  removed=%d",
            plaid_item.id,
            added_count,
            modified_count,
            removed_count,
        )
    else:
        logger.debug("Plaid sync  |  item=%s  |  no changes", plaid_item.id)
    return {"added": added_count, "modified": modified_count, "removed": removed_count}


async def sync_all_items(
    *,
    classifier: ClassifierPort | None = None,
    notifier: NotifierPort | None = None,
) -> int:
    """Sync transactions for all PlaidItems. Uses a fresh session per item
    so one DB failure doesn't break the rest of the cycle."""
    from ..database import async_session

    async with async_session() as db:
        result = await db.execute(select(PlaidItem))
        items = list(result.scalars().all())

    synced = 0
    for item in items:
        try:
            async with async_session() as db:
                # Re-fetch the item in this session
                refreshed = await db.get(PlaidItem, item.id)
                if refreshed is None:
                    continue
                await sync_transactions(
                    db, refreshed, classifier=classifier, notifier=notifier
                )
                synced += 1
        except Exception:
            logger.exception("Failed to sync plaid_item %s", item.id)

    return synced


async def seed_sandbox_plaid_item(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> PlaidItem | None:
    """Create a sandbox Plaid item programmatically for the dev seed user.

    Uses Plaid's /sandbox/public_token/create endpoint — only works in sandbox env.
    Skips if the user already has a connected item or Plaid creds are missing.
    """
    settings = get_settings()
    if settings.PLAID_ENV != "sandbox" or not settings.PLAID_CLIENT_ID or not settings.PLAID_SECRET:
        return None

    # Check if user already has Plaid items. Multiple items are valid now
    # because the dev scripts can create dedicated sandbox items.
    result = await db.execute(
        select(PlaidItem)
        .where(PlaidItem.user_id == user_id)
        .order_by(PlaidItem.created_at.desc())
    )
    existing_items = list(result.scalars().all())
    if existing_items:
        existing_item = existing_items[0]
        # Check if it already has Plaid transactions — if so, nothing to do
        txn_count = await db.execute(
            select(Transaction.id)
            .where(
                Transaction.user_id == user_id,
                Transaction.plaid_transaction_id.is_not(None),
            )
            .limit(1)
        )
        if txn_count.scalar_one_or_none():
            logger.info("Seed user already has Plaid transactions — skipping sandbox seed")
            return None
        # Items exist but no Plaid transactions — return the newest item so caller can re-sync
        logger.info(
            "Seed user has %d Plaid item(s) but no Plaid transactions — will re-sync newest item",
            len(existing_items),
        )
        return existing_item

    from plaid.model.sandbox_item_fire_webhook_request import SandboxItemFireWebhookRequest

    client = get_plaid_client()

    # ins_109508 = "First Platypus Bank" (Plaid sandbox test institution)
    request = SandboxPublicTokenCreateRequest(
        institution_id="ins_109508",
        initial_products=[Products("transactions")],
    )
    response = await _call_plaid(client.sandbox_public_token_create, request)

    item = await exchange_public_token(
        db, user_id, response.public_token, institution_name="First Platypus Bank"
    )

    # Fire DEFAULT_UPDATE webhook so sandbox prepares historical transactions,
    # then wait briefly for them to become available via /transactions/sync.
    try:
        access_token = _get_access_token(item)
        await _call_plaid(
            client.sandbox_item_fire_webhook,
            SandboxItemFireWebhookRequest(
                access_token=access_token,
                webhook_code="DEFAULT_UPDATE",
            ),
        )
        await asyncio.sleep(2)
    except Exception:
        logger.warning("Failed to fire sandbox webhook — transactions may be empty initially")

    logger.info("Sandbox Plaid item seeded for user %s", user_id)
    return item


async def create_sandbox_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    institution_name: str = "First Platypus Bank",
    override_username: str | None = None,
    override_password: str | None = None,
    days_requested: int = 30,
) -> PlaidItem:
    """Create a sandbox Plaid item without firing any webhook side effects."""
    settings = get_settings()
    if settings.PLAID_ENV != "sandbox":
        raise ValueError("Sandbox item creation is only available when PLAID_ENV=sandbox")

    client = get_plaid_client()
    options_kwargs: dict = {
        "transactions": SandboxPublicTokenCreateRequestOptionsTransactions(
            days_requested=days_requested
        )
    }
    if override_username is not None:
        options_kwargs["override_username"] = override_username
    if override_password is not None:
        options_kwargs["override_password"] = override_password

    request = SandboxPublicTokenCreateRequest(
        institution_id="ins_109508",
        initial_products=[Products("transactions")],
        options=SandboxPublicTokenCreateRequestOptions(**options_kwargs),
    )
    response = await _call_plaid(client.sandbox_public_token_create, request)
    return await exchange_public_token(
        db,
        user_id,
        response.public_token,
        institution_name=institution_name,
    )


async def create_sandbox_transactions(
    plaid_item: PlaidItem,
    *,
    transactions: list[dict],
) -> dict:
    """Create custom sandbox transactions for an existing sandbox item."""
    settings = get_settings()
    if settings.PLAID_ENV != "sandbox":
        raise ValueError(
            "Sandbox transaction creation is only available when PLAID_ENV=sandbox"
        )
    if not settings.PLAID_CLIENT_ID or not settings.PLAID_SECRET:
        raise ValueError("Plaid credentials are required to create sandbox transactions")

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{PLAID_ENV_MAP[settings.PLAID_ENV]}/sandbox/transactions/create",
            json={
                "client_id": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
                "access_token": _get_access_token(plaid_item),
                "transactions": transactions,
            },
        )
    response.raise_for_status()
    return response.json()


async def refresh_transactions(plaid_item: PlaidItem):
    """Request a Plaid transactions refresh for an existing item."""
    client = get_plaid_client()
    return await _call_plaid(
        client.transactions_refresh,
        TransactionsRefreshRequest(access_token=_get_access_token(plaid_item)),
    )


async def get_user_plaid_items(
    db: AsyncSession, user_id: uuid.UUID
) -> list[PlaidItem]:
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.user_id == user_id)
    )
    return list(result.scalars().all())


async def remove_plaid_item(db: AsyncSession, plaid_item: PlaidItem) -> None:
    client = get_plaid_client()
    try:
        await _call_plaid(
            client.item_remove,
            ItemRemoveRequest(access_token=_get_access_token(plaid_item)),
        )
    except Exception:
        logger.warning("Failed to remove item from Plaid API, removing locally anyway")

    # Detach transactions from accounts belonging to this item before deletion.
    # The DB cascade (plaid_item → accounts ON DELETE CASCADE, accounts → transactions
    # ON DELETE SET NULL) should handle this, but we do it explicitly to avoid
    # any ordering issues with the ORM session flush.
    account_ids = await db.execute(
        select(Account.id).where(Account.plaid_item_id == plaid_item.id)
    )
    for (acct_id,) in account_ids:
        await db.execute(
            sa_update(Transaction)
            .where(Transaction.account_id == acct_id)
            .values(account_id=None)
        )

    await db.delete(plaid_item)
    await db.commit()
