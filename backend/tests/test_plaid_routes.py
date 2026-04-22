"""Tests for backend.routers.plaid — link, exchange, sync, list, delete."""

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from fastapi import HTTPException

from backend.routers.plaid import (
    create_link_token,
    delete_item,
    exchange_token,
    list_items,
    sync_item,
    ExchangeTokenRequest,
)


class CreateLinkTokenRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_link_token(self):
        user = SimpleNamespace(id=uuid4())
        with patch(
            "backend.routers.plaid.plaid_service.create_link_token",
            new=AsyncMock(return_value="link-tok-abc"),
        ):
            resp = await create_link_token(user=user)
        self.assertEqual(resp.link_token, "link-tok-abc")


class ExchangeTokenRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_plaid_item_response(self):
        user = SimpleNamespace(id=uuid4())
        now = datetime.now(timezone.utc)
        item = SimpleNamespace(
            id=uuid4(), institution_name="Test Bank",
            last_synced_at=now, created_at=now, needs_reauth=False,
        )
        db = AsyncMock()
        with (
            patch("backend.routers.plaid.plaid_service.exchange_public_token", new=AsyncMock(return_value=item)),
            patch("backend.routers.plaid.plaid_service.sync_transactions", new=AsyncMock(return_value={"added": 5, "modified": 0, "removed": 0})),
        ):
            resp = await exchange_token(
                body=ExchangeTokenRequest(public_token="public-tok", institution_name="Test Bank"),
                user=user,
                db=db,
                classifier=SimpleNamespace(),
                notifier=SimpleNamespace(),
            )
        self.assertEqual(resp.institution_name, "Test Bank")

    async def test_handles_sync_failure_gracefully(self):
        user = SimpleNamespace(id=uuid4())
        now = datetime.now(timezone.utc)
        item = SimpleNamespace(
            id=uuid4(), institution_name="Test Bank",
            last_synced_at=None, created_at=now, needs_reauth=False,
        )
        db = AsyncMock()
        with (
            patch("backend.routers.plaid.plaid_service.exchange_public_token", new=AsyncMock(return_value=item)),
            patch("backend.routers.plaid.plaid_service.sync_transactions", new=AsyncMock(side_effect=RuntimeError("sync failed"))),
        ):
            resp = await exchange_token(
                body=ExchangeTokenRequest(public_token="public-tok"),
                user=user,
                db=db,
                classifier=SimpleNamespace(),
                notifier=SimpleNamespace(),
            )
        # Should not raise — exchange succeeds even if sync fails
        self.assertEqual(resp.id, item.id)
        db.rollback.assert_awaited_once()


class ListItemsRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_items(self):
        user = SimpleNamespace(id=uuid4())
        now = datetime.now(timezone.utc)
        items = [
            SimpleNamespace(id=uuid4(), institution_name="Bank A", last_synced_at=now, created_at=now, needs_reauth=False),
            SimpleNamespace(id=uuid4(), institution_name="Bank B", last_synced_at=None, created_at=now, needs_reauth=True),
        ]
        with patch("backend.routers.plaid.plaid_service.get_user_plaid_items", new=AsyncMock(return_value=items)):
            resp = await list_items(user=user, db=AsyncMock())
        self.assertEqual(len(resp), 2)
        self.assertIsNone(resp[1].last_synced_at)


def _mock_db_returning(obj):
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = obj
    db = AsyncMock()
    db.execute = AsyncMock(return_value=scalar_result)
    return db


class SyncItemRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await sync_item(uuid4(), user=user, db=db, classifier=None, notifier=None)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_syncs_and_returns_counts(self):
        item = SimpleNamespace(id=uuid4(), user_id=uuid4())
        db = _mock_db_returning(item)
        user = SimpleNamespace(id=item.user_id)
        with patch(
            "backend.routers.plaid.plaid_service.sync_transactions",
            new=AsyncMock(return_value={"added": 3, "modified": 1, "removed": 0}),
        ):
            resp = await sync_item(item.id, user=user, db=db, classifier=None, notifier=None)
        self.assertEqual(resp.added, 3)
        self.assertEqual(resp.modified, 1)
        self.assertEqual(resp.removed, 0)


class DeleteItemRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await delete_item(uuid4(), user=user, db=db)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_deletes_item(self):
        item = SimpleNamespace(id=uuid4(), user_id=uuid4())
        db = _mock_db_returning(item)
        user = SimpleNamespace(id=item.user_id)
        with patch("backend.routers.plaid.plaid_service.remove_plaid_item", new=AsyncMock()) as remove_mock:
            await delete_item(item.id, user=user, db=db)
        remove_mock.assert_awaited_once_with(db, item)


if __name__ == "__main__":
    unittest.main()
