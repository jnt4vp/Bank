"""Tests for backend.routers.transactions — ingest and list endpoints."""

import os
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.routers.transactions import ingest_transaction, list_transactions
from backend.schemas.transaction import TransactionCreate


class IngestTransactionRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_calls_ingest_use_case_with_correct_args(self):
        user = SimpleNamespace(id=uuid4(), email="u@example.com")
        txn = SimpleNamespace(
            id=uuid4(), user_id=user.id, merchant="Starbucks",
            description="Coffee", amount=Decimal("5.50"), category="Coffee Shops",
            flagged=True, flag_reason="keyword match", alert_sent=False,
            alert_sent_at=None, accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            created_at=datetime.now(timezone.utc),
            plaid_transaction_id=None, plaid_original_description=None,
            date=None, pending=False,
        )
        classifier = SimpleNamespace()
        notifier = SimpleNamespace()
        db = AsyncMock()

        with patch(
            "backend.routers.transactions.ingest_user_transaction",
            new=AsyncMock(return_value=txn),
        ) as ingest_mock:
            result = await ingest_transaction(
                TransactionCreate(merchant="Starbucks", description="Coffee", amount=5.50),
                db=db,
                current_user=user,
                classifier=classifier,
                notifier=notifier,
            )

        ingest_mock.assert_awaited_once_with(
            db,
            user_id=user.id,
            user_email="u@example.com",
            merchant="Starbucks",
            description="Coffee",
            amount=5.50,
            classifier=classifier,
            notifier=notifier,
        )
        self.assertEqual(result, txn)

    async def test_returns_transaction_on_success(self):
        user = SimpleNamespace(id=uuid4(), email="u@example.com")
        txn = SimpleNamespace(id=uuid4(), merchant="Target")
        with patch(
            "backend.routers.transactions.ingest_user_transaction",
            new=AsyncMock(return_value=txn),
        ):
            result = await ingest_transaction(
                TransactionCreate(merchant="Target", description="Groceries", amount=50.0),
                db=AsyncMock(),
                current_user=user,
                classifier=SimpleNamespace(),
                notifier=SimpleNamespace(),
            )
        self.assertEqual(result.merchant, "Target")


class ListTransactionsRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_calls_repo_with_flagged_filter(self):
        user = SimpleNamespace(id=uuid4())
        txns = [SimpleNamespace(id=uuid4(), flagged=True)]
        with patch(
            "backend.routers.transactions.get_transactions_for_user",
            new=AsyncMock(return_value=txns),
        ) as repo_mock:
            result = await list_transactions(
                db=AsyncMock(),
                current_user=user,
                flagged_only=True,
                limit=500,
                offset=0,
            )
        repo_mock.assert_awaited_once_with(
            unittest.mock.ANY, user.id, flagged_only=True, limit=500, offset=0
        )
        self.assertEqual(len(result), 1)

    async def test_default_returns_all(self):
        user = SimpleNamespace(id=uuid4())
        txns = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]
        with patch(
            "backend.routers.transactions.get_transactions_for_user",
            new=AsyncMock(return_value=txns),
        ) as repo_mock:
            result = await list_transactions(
                db=AsyncMock(),
                current_user=user,
                flagged_only=False,
                limit=500,
                offset=0,
            )
        repo_mock.assert_awaited_once_with(
            unittest.mock.ANY, user.id, flagged_only=False, limit=500, offset=0
        )
        self.assertEqual(len(result), 2)

    async def test_pagination_params_forwarded(self):
        user = SimpleNamespace(id=uuid4())
        with patch(
            "backend.routers.transactions.get_transactions_for_user",
            new=AsyncMock(return_value=[]),
        ) as repo_mock:
            await list_transactions(
                db=AsyncMock(),
                current_user=user,
                flagged_only=False,
                limit=100,
                offset=50,
            )
        repo_mock.assert_awaited_once_with(
            unittest.mock.ANY, user.id, flagged_only=False, limit=100, offset=50
        )


if __name__ == "__main__":
    unittest.main()
