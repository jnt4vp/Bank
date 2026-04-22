import asyncio
import json
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.account import Account
from ..models.plaid_item import PlaidItem
from ..models.shared_plaid_source import SharedPlaidSource
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


def _get_sandbox_plaid_client() -> plaid_api.PlaidApi:
    """Client pinned to Plaid's sandbox environment, used for the shared demo item.

    Falls back to the main PLAID_CLIENT_ID/PLAID_SECRET when PLAID_SANDBOX_* are empty —
    that path only makes sense when PLAID_ENV=sandbox (main client already is sandbox).
    """
    settings = get_settings()
    client_id = settings.PLAID_SANDBOX_CLIENT_ID or settings.PLAID_CLIENT_ID
    secret = settings.PLAID_SANDBOX_SECRET or settings.PLAID_SECRET
    configuration = plaid.Configuration(
        host=plaid.Environment.Sandbox,
        api_key={"clientId": client_id, "secret": secret},
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


_client: plaid_api.PlaidApi | None = None
_sandbox_client: plaid_api.PlaidApi | None = None


def get_plaid_client() -> plaid_api.PlaidApi:
    global _client
    if _client is None:
        _client = _get_plaid_client()
    return _client


def get_sandbox_plaid_client() -> plaid_api.PlaidApi:
    global _sandbox_client
    if _sandbox_client is None:
        _sandbox_client = _get_sandbox_plaid_client()
    return _sandbox_client


def _sandbox_client_configured() -> bool:
    """Whether a usable sandbox client can be built (either dedicated or main-in-sandbox-mode)."""
    settings = get_settings()
    if settings.PLAID_SANDBOX_CLIENT_ID and settings.PLAID_SANDBOX_SECRET:
        return True
    return (
        settings.PLAID_ENV == "sandbox"
        and bool(settings.PLAID_CLIENT_ID)
        and bool(settings.PLAID_SECRET)
    )


def _decrypt(token: str) -> str:
    try:
        return decrypt_token(token)
    except Exception:
        return token


async def _get_access_token_for_item(
    db: AsyncSession, plaid_item: PlaidItem
) -> tuple[str, plaid_api.PlaidApi]:
    """Resolve the access_token and correct Plaid client for a given PlaidItem.

    Subscriber items (shared_source_id set) read the token from the shared source and
    hit Plaid's sandbox environment; personal items use their own stored token on the
    main environment.
    """
    if plaid_item.shared_source_id is not None:
        result = await db.execute(
            select(SharedPlaidSource).where(
                SharedPlaidSource.id == plaid_item.shared_source_id
            )
        )
        source = result.scalar_one_or_none()
        if source is None:
            raise ValueError(
                f"PlaidItem {plaid_item.id} references a missing shared source"
            )
        return _decrypt(source.access_token), get_sandbox_plaid_client()

    if not plaid_item.access_token:
        raise ValueError(f"PlaidItem {plaid_item.id} has no access token")
    return _decrypt(plaid_item.access_token), get_plaid_client()


def _get_access_token(plaid_item: PlaidItem) -> str:
    """Legacy synchronous accessor. Works only for personal items; raises for shared subscribers."""
    if plaid_item.shared_source_id is not None:
        raise ValueError(
            "Subscriber items must use _get_access_token_for_item to resolve the source token"
        )
    if not plaid_item.access_token:
        raise ValueError(f"PlaidItem {plaid_item.id} has no access token")
    return _decrypt(plaid_item.access_token)


# ---------------------------------------------------------------------------
# Async wrappers for blocking Plaid SDK calls
# ---------------------------------------------------------------------------

async def _call_plaid(func, *args, **kwargs):
    """Run a synchronous Plaid SDK call in a thread so we don't block the event loop."""
    return await asyncio.to_thread(partial(func, *args, **kwargs))


def _extract_plaid_error_code(exc: Exception) -> str | None:
    """Pull error_code out of a Plaid ApiException body; None if it's not a Plaid error."""
    if not isinstance(exc, plaid.ApiException):
        return None
    body = getattr(exc, "body", None)
    if body is None:
        return None
    if isinstance(body, bytes):
        try:
            body = body.decode("utf-8", errors="replace")
        except Exception:
            return None
    try:
        payload = json.loads(body)
    except (TypeError, ValueError):
        return None
    code = payload.get("error_code") if isinstance(payload, dict) else None
    return str(code) if code else None


# Plaid personal-finance-category primaries that are never discretionary spending.
# Paychecks, interest, deposits, credit-card/loan payments, and internal transfers
# get noisy-flagged as pact violations when routed through the LLM, so we skip them.
_NON_SPENDING_PLAID_CATEGORIES = {
    "INCOME",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "LOAN_PAYMENTS",
    "BANK_FEES",
}


def _is_classifiable_spending(amount: float, plaid_category: str | None) -> bool:
    """True only for real outflows we'd want to evaluate against the user's pacts."""
    if amount <= 0:
        return False
    if plaid_category and plaid_category.upper() in _NON_SPENDING_PLAID_CATEGORIES:
        return False
    return True


async def _mark_item_needs_reauth(plaid_item_id: uuid.UUID) -> None:
    """Flip needs_reauth=True in a fresh session so we commit regardless of caller state."""
    from ..database import async_session

    async with async_session() as db:
        await db.execute(
            sa_update(PlaidItem)
            .where(PlaidItem.id == plaid_item_id)
            .values(needs_reauth=True)
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def create_link_token(
    user_id: uuid.UUID, *, access_token: str | None = None
) -> str:
    """Create a Plaid Link token.

    Pass `access_token` to produce an update-mode token for reconnecting an
    existing item (e.g. after ITEM_LOGIN_REQUIRED). In update mode, `products`
    must be omitted per Plaid's API requirements.
    """
    client = get_plaid_client()
    kwargs: dict = {
        "client_name": "PactBank",
        "country_codes": [CountryCode("US")],
        "language": "en",
        "user": LinkTokenCreateRequestUser(client_user_id=str(user_id)),
    }
    if access_token:
        kwargs["access_token"] = access_token
    else:
        kwargs["products"] = [Products("transactions")]
    request = LinkTokenCreateRequest(**kwargs)
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
        plaid_item.needs_reauth = False
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
    """Fetch accounts from Plaid and upsert into the accounts table for this item."""
    access_token, client = await _get_access_token_for_item(db, plaid_item)

    try:
        response = await _call_plaid(
            client.accounts_get,
            AccountsGetRequest(access_token=access_token),
        )
    except Exception as exc:
        if _extract_plaid_error_code(exc) == "ITEM_LOGIN_REQUIRED":
            logger.warning(
                "Plaid item %s needs re-auth (ITEM_LOGIN_REQUIRED); flagging and skipping",
                plaid_item.id,
            )
            await _mark_item_needs_reauth(plaid_item.id)
            raise
        logger.exception("Failed to fetch accounts for plaid_item %s", plaid_item.id)
        return

    for acct in response.accounts:
        # Scope by plaid_item_id — the same Plaid account_id may appear under
        # many subscriber items when pointing at the shared demo source.
        existing = await db.execute(
            select(Account).where(
                Account.plaid_item_id == plaid_item.id,
                Account.plaid_account_id == acct.account_id,
            )
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
    db: AsyncSession,
    plaid_account_id: str | None,
    plaid_item_id: uuid.UUID,
) -> uuid.UUID | None:
    """Look up our internal account UUID for a Plaid account_id under a specific item."""
    if not plaid_account_id:
        return None
    result = await db.execute(
        select(Account.id).where(
            Account.plaid_item_id == plaid_item_id,
            Account.plaid_account_id == plaid_account_id,
        )
    )
    row = result.scalar_one_or_none()
    return row


async def _process_added_transaction(
    db: AsyncSession,
    txn,
    *,
    user_id: uuid.UUID,
    plaid_item_id: uuid.UUID,
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
            Transaction.user_id == user_id,
            Transaction.plaid_transaction_id == txn.transaction_id,
        )
    )
    if existing.scalar_one_or_none():
        return False

    account_id = await _resolve_account_id(db, txn.account_id, plaid_item_id)
    plaid_original_description = txn.original_description or None
    merchant = txn.merchant_name or txn.name or "Unknown"
    description = txn.name or plaid_original_description or ""
    amount = float(txn.amount)

    category = resolved_plaid_category(merchant, description, txn)
    flagged = False
    flag_reason = None

    if classifier and _is_classifiable_spending(amount, category):
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
    try:
        async with db.begin_nested():
            db.add(new_txn)
            await db.flush()
    except IntegrityError:
        # Concurrent sync (e.g. background poller + manual /plaid/sync) already
        # inserted this row — safe to skip. Savepoint rollback keeps the outer
        # transaction alive so the rest of the page still syncs.
        logger.info(
            "Skipping duplicate plaid txn %s for user %s (already inserted concurrently)",
            txn.transaction_id,
            user_id,
        )
        return False

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
    plaid_item_id: uuid.UUID,
    notifier: NotifierPort | None,
    user_email: str | None,
    is_initial_backfill: bool,
) -> bool:
    """Handle a single modified Plaid transaction. Returns True if an existing row was updated."""
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.plaid_transaction_id == txn.transaction_id,
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
        existing_txn.account_id = await _resolve_account_id(
            db, txn.account_id, plaid_item_id
        )

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
    *,
    user_id: uuid.UUID,
) -> int:
    """Delete local rows for Plaid-removed transactions. Returns count of deleted rows."""
    removed_count = 0
    for txn in removed_txns:
        result = await db.execute(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.plaid_transaction_id == txn.transaction_id,
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
    plaid_item_id: uuid.UUID,
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
            plaid_item_id=plaid_item_id,
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
            plaid_item_id=plaid_item_id,
            notifier=notifier,
            user_email=user_email,
            is_initial_backfill=is_initial_backfill,
        ):
            modified += 1

    removed = await _process_removed_transactions(db, response.removed, user_id=user_id)
    return added, modified, removed


async def sync_transactions(
    db: AsyncSession,
    plaid_item: PlaidItem,
    *,
    classifier: ClassifierPort | None = None,
    notifier: NotifierPort | None = None,
) -> dict:
    """Run /transactions/sync for a single PlaidItem. Returns counts of added/modified/removed."""
    if plaid_item.needs_reauth:
        logger.debug(
            "Plaid sync skipped — item %s is awaiting re-auth", plaid_item.id
        )
        return {"added": 0, "modified": 0, "removed": 0}

    access_token, client = await _get_access_token_for_item(db, plaid_item)
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
            access_token=access_token,
            options=TransactionsSyncRequestOptions(
                include_original_description=True,
                include_personal_finance_category=True,
            ),
            **({"cursor": cursor} if cursor else {}),
        )
        try:
            response = await _call_plaid(client.transactions_sync, request)
        except Exception as exc:
            if _extract_plaid_error_code(exc) == "ITEM_LOGIN_REQUIRED":
                logger.warning(
                    "Plaid item %s needs re-auth (ITEM_LOGIN_REQUIRED); flagging and stopping sync",
                    plaid_item.id,
                )
                await db.rollback()
                await _mark_item_needs_reauth(plaid_item.id)
                return {"added": 0, "modified": 0, "removed": 0}
            raise

        a, m, r = await _process_sync_page(
            db, response,
            user_id=plaid_item.user_id,
            plaid_item_id=plaid_item.id,
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
        result = await db.execute(
            select(PlaidItem).where(PlaidItem.needs_reauth.is_(False))
        )
        items = list(result.scalars().all())

    synced = 0
    for item in items:
        try:
            async with async_session() as db:
                # Re-fetch the item in this session
                refreshed = await db.get(PlaidItem, item.id)
                if refreshed is None or refreshed.needs_reauth:
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


async def refresh_transactions(db: AsyncSession, plaid_item: PlaidItem):
    """Request a Plaid transactions refresh for an existing item."""
    access_token, client = await _get_access_token_for_item(db, plaid_item)
    return await _call_plaid(
        client.transactions_refresh,
        TransactionsRefreshRequest(access_token=access_token),
    )


async def get_user_plaid_items(
    db: AsyncSession, user_id: uuid.UUID
) -> list[PlaidItem]:
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.user_id == user_id)
    )
    return list(result.scalars().all())


async def remove_plaid_item(db: AsyncSession, plaid_item: PlaidItem) -> None:
    # Subscriber items share an access token owned by the shared source — never
    # call /item/remove for them, that would revoke the token for every subscriber.
    if plaid_item.shared_source_id is None:
        client = get_plaid_client()
        try:
            await _call_plaid(
                client.item_remove,
                ItemRemoveRequest(access_token=_decrypt(plaid_item.access_token)),
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


# ---------------------------------------------------------------------------
# Shared demo-bank source (communal Plaid item)
# ---------------------------------------------------------------------------

async def get_active_shared_source(db: AsyncSession) -> SharedPlaidSource | None:
    result = await db.execute(
        select(SharedPlaidSource)
        .where(SharedPlaidSource.is_active.is_(True))
        .order_by(SharedPlaidSource.created_at.desc())
    )
    return result.scalars().first()


async def ensure_shared_demo_source(db: AsyncSession) -> SharedPlaidSource | None:
    """Create the shared demo Plaid item on first startup. Idempotent."""
    existing = await get_active_shared_source(db)
    if existing is not None:
        return existing

    if not _sandbox_client_configured():
        logger.info(
            "Skipping shared demo Plaid source — sandbox credentials not configured"
        )
        return None

    sandbox_client = get_sandbox_plaid_client()

    # ins_109508 = "First Platypus Bank" (Plaid's sandbox test institution).
    create_request = SandboxPublicTokenCreateRequest(
        institution_id="ins_109508",
        initial_products=[Products("transactions")],
    )
    try:
        create_response = await _call_plaid(
            sandbox_client.sandbox_public_token_create, create_request
        )
        exchange_response = await _call_plaid(
            sandbox_client.item_public_token_exchange,
            ItemPublicTokenExchangeRequest(public_token=create_response.public_token),
        )
    except Exception:
        logger.exception("Failed to bootstrap shared demo Plaid source")
        return None

    source = SharedPlaidSource(
        item_id=exchange_response.item_id,
        access_token=encrypt_token(exchange_response.access_token),
        institution_name="First Platypus Bank (Demo)",
        is_active=True,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    # Prime the sandbox with historical transactions so subscribers see data on first sync.
    try:
        from plaid.model.sandbox_item_fire_webhook_request import (
            SandboxItemFireWebhookRequest,
        )

        await _call_plaid(
            sandbox_client.sandbox_item_fire_webhook,
            SandboxItemFireWebhookRequest(
                access_token=exchange_response.access_token,
                webhook_code="DEFAULT_UPDATE",
            ),
        )
        await asyncio.sleep(2)
    except Exception:
        logger.warning(
            "Failed to fire sandbox webhook for shared source — subscribers may see empty history initially"
        )

    logger.info("Shared demo Plaid source created: %s", source.id)
    return source


async def subscribe_user_to_shared_source(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    classifier: ClassifierPort | None = None,
    notifier: NotifierPort | None = None,
) -> PlaidItem:
    """Create a per-user PlaidItem backed by the active shared demo source.

    Each subscriber keeps its own accounts, transactions, and /transactions/sync cursor —
    only the upstream access_token is shared.
    """
    source = await get_active_shared_source(db)
    if source is None:
        raise ValueError("No active shared demo Plaid source is available")

    existing = await db.execute(
        select(PlaidItem).where(
            PlaidItem.user_id == user_id,
            PlaidItem.shared_source_id == source.id,
        )
    )
    plaid_item = existing.scalar_one_or_none()

    if plaid_item is None:
        plaid_item = PlaidItem(
            user_id=user_id,
            # item_id must be unique globally; namespace subscriber rows so they don't
            # collide with the source's Plaid item_id or with each other.
            item_id=f"shared:{source.id}:{user_id}",
            access_token=None,
            shared_source_id=source.id,
            institution_name=source.institution_name,
        )
        db.add(plaid_item)
        await db.commit()
        await db.refresh(plaid_item)

    await _touch_bank_connected_at(db, user_id)

    try:
        await sync_transactions(db, plaid_item, classifier=classifier, notifier=notifier)
    except Exception:
        logger.warning(
            "Initial sync failed for demo subscription %s, poller will retry",
            plaid_item.id,
        )
        await db.rollback()

    await db.refresh(plaid_item)
    return plaid_item
