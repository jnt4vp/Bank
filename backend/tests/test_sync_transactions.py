"""Tests for backend.services.plaid_service.sync_transactions — the core sync loop."""

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.ports.classifier import ClassificationResult


def _make_plaid_item(*, cursor=None, last_synced_at=None):
    return SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        access_token="encrypted-tok",
        transaction_cursor=cursor,
        last_synced_at=last_synced_at,
    )


def _make_plaid_txn(*, transaction_id=None, amount=10.0, merchant_name="Test Merchant",
                     name="Test", pending=False, original_description=None, account_id=None):
    return SimpleNamespace(
        transaction_id=transaction_id or f"plaid-{uuid4().hex[:8]}",
        merchant_name=merchant_name,
        name=name,
        amount=amount,
        pending=pending,
        original_description=original_description,
        account_id=account_id,
        date=datetime.now(timezone.utc).date(),
        personal_finance_category=None,
        category=None,
    )


def _make_sync_response(*, added=None, modified=None, removed=None, has_more=False, next_cursor="cursor-2"):
    return SimpleNamespace(
        added=added or [],
        modified=modified or [],
        removed=removed or [],
        has_more=has_more,
        next_cursor=next_cursor,
    )


def _build_smart_db(*, user_email="u@example.com", existing_txn=None, has_notifier=False):
    """Build a db mock that handles the dynamic execute calls in sync_transactions.

    The sync loop calls db.execute multiple times:
    - If notifier is set: first call is user email lookup
    - For each added txn: existing txn check
    - For each removed txn: existing txn lookup
    """

    def _make_result(value):
        r = MagicMock()
        r.scalar_one_or_none.return_value = value
        return r

    email_result = _make_result(user_email)
    txn_result = _make_result(existing_txn)

    call_count = [0]
    email_consumed = [False]

    async def _execute(query, *args, **kwargs):
        call_count[0] += 1
        # First call is user email lookup only when notifier is provided
        if has_notifier and not email_consumed[0]:
            email_consumed[0] = True
            return email_result
        return txn_result

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=_execute)
    return db


class SyncTransactionsAddedTest(unittest.IsolatedAsyncioTestCase):
    @patch("backend.services.plaid_service._sync_accounts", new=AsyncMock())
    @patch("backend.services.plaid_service.ensure_discipline_window_after_plaid_sync", new=AsyncMock())
    @patch("backend.services.plaid_service.record_simulated_savings_transfers_for_transaction", new=AsyncMock(return_value=0))
    @patch("backend.services.plaid_service.send_accountability_alerts_for_transaction", new=AsyncMock())
    @patch("backend.services.plaid_service.resolved_plaid_category", return_value="Shopping")
    @patch("backend.services.plaid_service._resolve_account_id", new=AsyncMock(return_value=None))
    @patch("backend.services.plaid_service.get_active_pact_categories", new=AsyncMock(return_value=["Shopping"]))
    async def test_adds_new_transactions(self, _resolved_cat):
        item = _make_plaid_item(cursor="cursor-1")
        txn1 = _make_plaid_txn(amount=25.0, merchant_name="Amazon")
        sync_resp = _make_sync_response(added=[txn1])

        db = _build_smart_db(existing_txn=None)  # No existing txn

        with (
            patch("backend.services.plaid_service.get_plaid_client", return_value=MagicMock()),
            patch("backend.services.plaid_service._call_plaid", new=AsyncMock(return_value=sync_resp)),
            patch("backend.services.plaid_service._get_access_token", return_value="access-tok"),
        ):
            from backend.services.plaid_service import sync_transactions
            counts = await sync_transactions(db, item, classifier=None, notifier=None)

        self.assertEqual(counts["added"], 1)
        db.add.assert_called_once()
        db.commit.assert_awaited()

    @patch("backend.services.plaid_service._sync_accounts", new=AsyncMock())
    @patch("backend.services.plaid_service.ensure_discipline_window_after_plaid_sync", new=AsyncMock())
    @patch("backend.services.plaid_service.record_simulated_savings_transfers_for_transaction", new=AsyncMock(return_value=0))
    @patch("backend.services.plaid_service.send_accountability_alerts_for_transaction", new=AsyncMock())
    @patch("backend.services.plaid_service.resolved_plaid_category", return_value="Coffee Shops")
    @patch("backend.services.plaid_service._resolve_account_id", new=AsyncMock(return_value=None))
    @patch("backend.services.plaid_service.get_active_pact_categories", new=AsyncMock(return_value=["Coffee Shops"]))
    async def test_classifies_and_sends_alert_for_flagged(self, _resolved_cat):
        item = _make_plaid_item(cursor="cursor-1")
        txn1 = _make_plaid_txn(amount=5.0, merchant_name="Starbucks")
        sync_resp = _make_sync_response(added=[txn1])

        db = _build_smart_db(existing_txn=None, has_notifier=True)

        notifier = SimpleNamespace(
            send_transaction_alert=AsyncMock(),
            send_accountability_alert=AsyncMock(return_value=True),
        )

        with (
            patch("backend.services.plaid_service.get_plaid_client", return_value=MagicMock()),
            patch("backend.services.plaid_service._call_plaid", new=AsyncMock(return_value=sync_resp)),
            patch("backend.services.plaid_service._get_access_token", return_value="access-tok"),
            patch("backend.services.plaid_service.classify_transaction", new=AsyncMock(
                return_value=ClassificationResult(flagged=True, category="Coffee Shops", flag_reason="keyword")
            )),
        ):
            from backend.services.plaid_service import sync_transactions
            counts = await sync_transactions(db, item, classifier=SimpleNamespace(), notifier=notifier)

        self.assertEqual(counts["added"], 1)
        notifier.send_transaction_alert.assert_awaited_once()

    @patch("backend.services.plaid_service._sync_accounts", new=AsyncMock())
    @patch("backend.services.plaid_service.ensure_discipline_window_after_plaid_sync", new=AsyncMock())
    @patch("backend.services.plaid_service.record_simulated_savings_transfers_for_transaction", new=AsyncMock(return_value=0))
    @patch("backend.services.plaid_service.get_active_pact_categories", new=AsyncMock(return_value=[]))
    async def test_skips_duplicate_plaid_transaction_id(self, *_):
        item = _make_plaid_item(cursor="cursor-1")
        txn1 = _make_plaid_txn()
        sync_resp = _make_sync_response(added=[txn1])

        # Existing txn found — should skip
        existing = SimpleNamespace(id=uuid4())
        db = _build_smart_db(existing_txn=existing)

        with (
            patch("backend.services.plaid_service.get_plaid_client", return_value=MagicMock()),
            patch("backend.services.plaid_service._call_plaid", new=AsyncMock(return_value=sync_resp)),
            patch("backend.services.plaid_service._get_access_token", return_value="access-tok"),
        ):
            from backend.services.plaid_service import sync_transactions
            counts = await sync_transactions(db, item, classifier=None, notifier=None)

        self.assertEqual(counts["added"], 0)
        db.add.assert_not_called()

    @patch("backend.services.plaid_service._sync_accounts", new=AsyncMock())
    @patch("backend.services.plaid_service.ensure_discipline_window_after_plaid_sync", new=AsyncMock())
    @patch("backend.services.plaid_service.get_active_pact_categories", new=AsyncMock(return_value=[]))
    @patch("backend.services.plaid_service.resolved_plaid_category", return_value=None)
    @patch("backend.services.plaid_service._resolve_account_id", new=AsyncMock(return_value=None))
    async def test_initial_backfill_skips_alerts(self, *_):
        """When no cursor and no last_synced_at, it's an initial backfill — no alerts."""
        item = _make_plaid_item(cursor=None, last_synced_at=None)
        txn1 = _make_plaid_txn()
        sync_resp = _make_sync_response(added=[txn1])

        db = _build_smart_db(existing_txn=None, has_notifier=True)

        notifier = SimpleNamespace(
            send_transaction_alert=AsyncMock(),
            send_accountability_alert=AsyncMock(return_value=True),
        )

        with (
            patch("backend.services.plaid_service.get_plaid_client", return_value=MagicMock()),
            patch("backend.services.plaid_service._call_plaid", new=AsyncMock(return_value=sync_resp)),
            patch("backend.services.plaid_service._get_access_token", return_value="access-tok"),
            patch("backend.services.plaid_service.record_simulated_savings_transfers_for_transaction", new=AsyncMock(return_value=0)) as sst_mock,
        ):
            from backend.services.plaid_service import sync_transactions
            counts = await sync_transactions(db, item, classifier=None, notifier=notifier)

        self.assertEqual(counts["added"], 1)
        notifier.send_transaction_alert.assert_not_awaited()
        sst_mock.assert_awaited_once()
        call_kwargs = sst_mock.call_args[1]
        self.assertTrue(call_kwargs["skip_for_initial_plaid_backfill"])


class SyncTransactionsRemovedTest(unittest.IsolatedAsyncioTestCase):
    @patch("backend.services.plaid_service._sync_accounts", new=AsyncMock())
    @patch("backend.services.plaid_service.ensure_discipline_window_after_plaid_sync", new=AsyncMock())
    @patch("backend.services.plaid_service.get_active_pact_categories", new=AsyncMock(return_value=[]))
    async def test_removes_transactions(self, *_):
        item = _make_plaid_item(cursor="cursor-1")
        removed_plaid_txn = SimpleNamespace(transaction_id="plaid-removed-1")
        sync_resp = _make_sync_response(removed=[removed_plaid_txn])

        existing = SimpleNamespace(id=uuid4())
        db = _build_smart_db(existing_txn=existing)

        with (
            patch("backend.services.plaid_service.get_plaid_client", return_value=MagicMock()),
            patch("backend.services.plaid_service._call_plaid", new=AsyncMock(return_value=sync_resp)),
            patch("backend.services.plaid_service._get_access_token", return_value="access-tok"),
        ):
            from backend.services.plaid_service import sync_transactions
            counts = await sync_transactions(db, item, classifier=None, notifier=None)

        self.assertEqual(counts["removed"], 1)
        db.delete.assert_awaited_once_with(existing)


class SyncTransactionsCursorTest(unittest.IsolatedAsyncioTestCase):
    @patch("backend.services.plaid_service._sync_accounts", new=AsyncMock())
    @patch("backend.services.plaid_service.ensure_discipline_window_after_plaid_sync", new=AsyncMock())
    @patch("backend.services.plaid_service.get_active_pact_categories", new=AsyncMock(return_value=[]))
    async def test_updates_cursor_and_last_synced(self, *_):
        item = _make_plaid_item(cursor="old-cursor")
        sync_resp = _make_sync_response(next_cursor="new-cursor")

        db = _build_smart_db(user_email=None)

        with (
            patch("backend.services.plaid_service.get_plaid_client", return_value=MagicMock()),
            patch("backend.services.plaid_service._call_plaid", new=AsyncMock(return_value=sync_resp)),
            patch("backend.services.plaid_service._get_access_token", return_value="access-tok"),
        ):
            from backend.services.plaid_service import sync_transactions
            await sync_transactions(db, item, classifier=None, notifier=None)

        self.assertEqual(item.transaction_cursor, "new-cursor")
        self.assertIsNotNone(item.last_synced_at)
        db.commit.assert_awaited()


if __name__ == "__main__":
    unittest.main()
