"""Tests for backend.routers.pact — CRUD, locking, validation."""

import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from fastapi import HTTPException

from backend.routers.pact import create_pact, delete_pact, get_pact, get_user_pacts, update_pact
from backend.schemas.pact import PactCreate, PactUpdate


def _mock_db_returning(obj):
    """Build a mock async session whose execute returns obj via scalar_one_or_none."""
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = obj
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [obj] if obj else []
    scalar_result.scalars.return_value = scalars_mock
    db = AsyncMock()
    db.execute = AsyncMock(return_value=scalar_result)
    return db


class CreatePactTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_both_preset_and_custom(self):
        payload = PactCreate.__new__(PactCreate)
        object.__setattr__(payload, "preset_category", "Coffee Shops")
        object.__setattr__(payload, "custom_category", "My Custom")
        object.__setattr__(payload, "category", None)
        object.__setattr__(payload, "status", "active")
        object.__setattr__(payload, "locked_until", None)

        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await create_pact(payload, db=AsyncMock(), current_user=user)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not both", ctx.exception.detail)

    async def test_rejects_empty_category(self):
        payload = PactCreate.__new__(PactCreate)
        object.__setattr__(payload, "preset_category", None)
        object.__setattr__(payload, "custom_category", None)
        object.__setattr__(payload, "category", None)
        object.__setattr__(payload, "status", "active")
        object.__setattr__(payload, "locked_until", None)

        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await create_pact(payload, db=AsyncMock(), current_user=user)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_creates_pact_with_preset(self):
        payload = PactCreate.__new__(PactCreate)
        object.__setattr__(payload, "preset_category", "Coffee Shops")
        object.__setattr__(payload, "custom_category", None)
        object.__setattr__(payload, "category", "Coffee Shops")
        object.__setattr__(payload, "status", "active")
        object.__setattr__(payload, "locked_until", None)

        user = SimpleNamespace(id=uuid4())
        db = AsyncMock()
        await create_pact(payload, db=db, current_user=user)
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_creates_pact_with_custom_category(self):
        payload = PactCreate.__new__(PactCreate)
        object.__setattr__(payload, "preset_category", None)
        object.__setattr__(payload, "custom_category", "My Spending")
        object.__setattr__(payload, "category", "My Spending")
        object.__setattr__(payload, "status", "active")
        object.__setattr__(payload, "locked_until", None)

        user = SimpleNamespace(id=uuid4())
        db = AsyncMock()
        await create_pact(payload, db=db, current_user=user)
        db.add.assert_called_once()


class GetPactTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await get_pact(uuid4(), db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_found_returns_pact(self):
        user_id = uuid4()
        pact = SimpleNamespace(id=uuid4(), user_id=user_id, category="Coffee Shops")
        db = _mock_db_returning(pact)
        user = SimpleNamespace(id=user_id)
        result = await get_pact(pact.id, db=db, current_user=user)
        self.assertEqual(result, pact)

    async def test_wrong_owner_returns_403(self):
        pact = SimpleNamespace(id=uuid4(), user_id=uuid4(), category="Coffee Shops")
        db = _mock_db_returning(pact)
        other_user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await get_pact(pact.id, db=db, current_user=other_user)
        self.assertEqual(ctx.exception.status_code, 403)


class GetUserPactsTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_list(self):
        user_id = uuid4()
        pact = SimpleNamespace(id=uuid4(), category="Coffee Shops")
        db = _mock_db_returning(pact)
        user = SimpleNamespace(id=user_id)
        result = await get_user_pacts(user_id, db=db, current_user=user)
        self.assertIsInstance(result, list)

    async def test_wrong_user_returns_403(self):
        user = SimpleNamespace(id=uuid4())
        other_user_id = uuid4()
        with self.assertRaises(HTTPException) as ctx:
            await get_user_pacts(other_user_id, db=AsyncMock(), current_user=user)
        self.assertEqual(ctx.exception.status_code, 403)


class UpdatePactTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        payload = PactUpdate(status="paused")
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await update_pact(uuid4(), payload, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_wrong_owner_returns_403(self):
        pact = SimpleNamespace(
            id=uuid4(), user_id=uuid4(), locked_until=None,
            preset_category="Coffee Shops", custom_category=None, category="Coffee Shops",
        )
        db = _mock_db_returning(pact)
        other_user = SimpleNamespace(id=uuid4())  # different user
        payload = PactUpdate(status="paused")
        with self.assertRaises(HTTPException) as ctx:
            await update_pact(pact.id, payload, db=db, current_user=other_user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_locked_pact_returns_403(self):
        user_id = uuid4()
        pact = SimpleNamespace(
            id=uuid4(), user_id=user_id,
            locked_until=datetime.now(timezone.utc) + timedelta(days=7),
            preset_category="Coffee Shops", custom_category=None, category="Coffee Shops",
        )
        db = _mock_db_returning(pact)
        user = SimpleNamespace(id=user_id)
        payload = PactUpdate(status="paused")
        with self.assertRaises(HTTPException) as ctx:
            await update_pact(pact.id, payload, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("locked", ctx.exception.detail)

    async def test_expired_lock_allows_update(self):
        user_id = uuid4()
        pact = SimpleNamespace(
            id=uuid4(), user_id=user_id,
            locked_until=datetime.now(timezone.utc) - timedelta(hours=1),
            preset_category="Coffee Shops", custom_category=None, category="Coffee Shops",
            status="active",
        )
        db = _mock_db_returning(pact)
        user = SimpleNamespace(id=user_id)
        payload = PactUpdate(status="paused")
        await update_pact(pact.id, payload, db=db, current_user=user)
        self.assertEqual(pact.status, "paused")
        db.commit.assert_awaited_once()

    async def test_rejects_both_preset_and_custom_on_update(self):
        user_id = uuid4()
        pact = SimpleNamespace(
            id=uuid4(), user_id=user_id, locked_until=None,
            preset_category="Coffee Shops", custom_category=None, category="Coffee Shops",
            status="active",
        )
        db = _mock_db_returning(pact)
        user = SimpleNamespace(id=user_id)
        payload = PactUpdate(custom_category="My Custom")
        # After applying update, pact has both preset and custom set
        with self.assertRaises(HTTPException) as ctx:
            await update_pact(pact.id, payload, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 400)


class DeletePactTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await delete_pact(uuid4(), db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_wrong_owner_returns_403(self):
        pact = SimpleNamespace(id=uuid4(), user_id=uuid4())
        db = _mock_db_returning(pact)
        other_user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await delete_pact(pact.id, db=db, current_user=other_user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_deletes_owned_pact(self):
        user_id = uuid4()
        pact = SimpleNamespace(id=uuid4(), user_id=user_id)
        db = _mock_db_returning(pact)
        user = SimpleNamespace(id=user_id)
        await delete_pact(pact.id, db=db, current_user=user)
        db.delete.assert_awaited_once_with(pact)
        db.commit.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
