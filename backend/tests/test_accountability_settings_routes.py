"""Tests for backend.routers.accountability_settings — upsert and get."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from fastapi import HTTPException

from backend.routers.accountability_settings import (
    _validated_partner_ids,
    get_accountability_settings,
    upsert_accountability_settings,
)
from backend.schemas.accountability_settings import AccountabilitySettingsCreate


def _mock_db_execute(*results):
    """Returns a db mock whose sequential execute calls return the given objects."""
    side_effects = []
    for obj in results:
        result = MagicMock()
        result.scalar_one_or_none.return_value = obj
        scalars = MagicMock()
        scalars.all.return_value = [obj] if obj else []
        result.scalars.return_value = scalars
        side_effects.append(result)
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=side_effects)
    return db


class ValidatedPartnerIdsTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_empty_for_non_friend_type(self):
        result = await _validated_partner_ids(
            AsyncMock(), user_id=uuid4(), accountability_type="self", partner_ids=[uuid4()]
        )
        self.assertEqual(result, [])

    async def test_returns_empty_when_no_partner_ids(self):
        result = await _validated_partner_ids(
            AsyncMock(), user_id=uuid4(), accountability_type="friend", partner_ids=[]
        )
        self.assertEqual(result, [])

    async def test_raises_when_partner_not_found(self):
        pid = uuid4()
        scalars = MagicMock()
        scalars.all.return_value = []
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars
        db = AsyncMock()
        db.execute = AsyncMock(return_value=exec_result)

        with self.assertRaises(HTTPException) as ctx:
            await _validated_partner_ids(
                db, user_id=uuid4(), accountability_type="friend", partner_ids=[pid]
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_returns_matched_ids(self):
        pid = uuid4()
        scalars = MagicMock()
        scalars.all.return_value = [pid]
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars
        db = AsyncMock()
        db.execute = AsyncMock(return_value=exec_result)

        result = await _validated_partner_ids(
            db, user_id=uuid4(), accountability_type="friend", partner_ids=[pid]
        )
        self.assertEqual(result, [str(pid)])


class UpsertAccountabilitySettingsTest(unittest.IsolatedAsyncioTestCase):
    async def test_pact_not_found_returns_404(self):
        pact_id = uuid4()
        # First execute: pact lookup returns None
        db = _mock_db_execute(None)
        payload = AccountabilitySettingsCreate(
            pact_id=pact_id, accountability_type="self",
            discipline_savings_percentage=10.0,
        )
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await upsert_accountability_settings(payload, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_creates_new_settings_for_pact(self):
        user_id = uuid4()
        pact_id = uuid4()
        settings_id = uuid4()
        # After assignment, pact.accountability_settings will be the new ORM object
        # which has id=None since it's not flushed to DB. We need the pact to return
        # a settings object with an id after the route sets it.
        created_settings = SimpleNamespace(
            id=settings_id, pact_id=pact_id, accountability_type="self",
            discipline_savings_percentage=5.0, accountability_note=None,
            accountability_partner_ids=[],
        )
        pact = SimpleNamespace(
            id=pact_id, user_id=user_id,
            accountability_settings=None,
        )
        # Execute calls: 1) pact lookup, 2) existing settings lookup
        db = _mock_db_execute(pact, None)
        user = SimpleNamespace(id=user_id)
        payload = AccountabilitySettingsCreate(
            pact_id=pact_id, accountability_type="self",
            discipline_savings_percentage=5.0,
        )

        # After flush, the ORM would assign an id. Simulate by setting it on flush.
        async def _fake_flush():
            if pact.accountability_settings and not hasattr(pact.accountability_settings, '_patched'):
                pact.accountability_settings.id = settings_id
                pact.accountability_settings._patched = True
        db.flush = AsyncMock(side_effect=_fake_flush)

        with (
            patch("backend.routers.accountability_settings._validated_partner_ids", new=AsyncMock(return_value=[])),
            patch("backend.routers.accountability_settings.backfill_simulated_savings_for_user", new=AsyncMock(return_value=0)),
        ):
            result = await upsert_accountability_settings(payload, db=db, current_user=user)

        self.assertEqual(result.accountability_type, "self")
        self.assertEqual(result.discipline_savings_percentage, 5.0)


class GetAccountabilitySettingsTest(unittest.IsolatedAsyncioTestCase):
    async def test_pact_not_found_returns_404(self):
        db = _mock_db_execute(None)
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await get_accountability_settings(uuid4(), db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_settings_not_found_returns_404(self):
        pact = SimpleNamespace(id=uuid4(), user_id=uuid4())
        db = _mock_db_execute(pact, None)
        user = SimpleNamespace(id=pact.user_id)
        with self.assertRaises(HTTPException) as ctx:
            await get_accountability_settings(pact.id, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_returns_settings(self):
        pact_id = uuid4()
        pact = SimpleNamespace(id=pact_id, user_id=uuid4())
        settings = SimpleNamespace(
            id=uuid4(), pact_id=pact_id, accountability_type="friend",
            accountability_note="stay on track", discipline_savings_percentage=10.0,
            accountability_partner_ids=[str(uuid4())],
        )
        db = _mock_db_execute(pact, settings)
        user = SimpleNamespace(id=pact.user_id)
        result = await get_accountability_settings(pact_id, db=db, current_user=user)
        self.assertEqual(result.accountability_type, "friend")
        self.assertEqual(result.discipline_savings_percentage, 10.0)


if __name__ == "__main__":
    unittest.main()
