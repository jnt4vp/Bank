"""Tests for backend.routers.accountability_partners — CRUD + alert settings."""

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from backend.routers.accountability_partners import (
    create_partner,
    delete_partner,
    get_alert_settings,
    list_partners,
    update_alert_settings,
    update_partner,
)
from backend.schemas.accountability_partners import (
    AccountabilityAlertSettingsUpdate,
    AccountabilityPartnerCreate,
    AccountabilityPartnerUpdate,
)


def _mock_db_returning(obj):
    scalars = MagicMock()
    scalars.all.return_value = [obj] if obj else []
    result = MagicMock()
    result.scalar_one_or_none.return_value = obj
    result.scalars.return_value = scalars
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


class ListPartnersTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_partners_for_user(self):
        partner = SimpleNamespace(id=uuid4(), partner_name="Alice")
        db = _mock_db_returning(partner)
        user = SimpleNamespace(id=uuid4())
        result = await list_partners(db=db, current_user=user)
        self.assertEqual(len(result), 1)


class CreatePartnerTest(unittest.IsolatedAsyncioTestCase):
    async def test_creates_partner(self):
        user = SimpleNamespace(id=uuid4())
        db = AsyncMock()
        payload = AccountabilityPartnerCreate(
            partner_name="Alice", partner_email="alice@example.com",
        )
        await create_partner(payload, db=db, current_user=user)
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_duplicate_email_returns_400(self):
        user = SimpleNamespace(id=uuid4())
        db = AsyncMock()
        db.commit = AsyncMock(side_effect=IntegrityError("dup", {}, Exception()))
        payload = AccountabilityPartnerCreate(
            partner_name="Alice", partner_email="alice@example.com",
        )
        with self.assertRaises(HTTPException) as ctx:
            await create_partner(payload, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("email already exists", ctx.exception.detail)

    async def test_email_is_lowercased(self):
        user = SimpleNamespace(id=uuid4())
        db = AsyncMock()
        payload = AccountabilityPartnerCreate(
            partner_name="Bob", partner_email="Bob@Example.COM",
        )
        await create_partner(payload, db=db, current_user=user)
        added_partner = db.add.call_args[0][0]
        self.assertEqual(added_partner.partner_email, "bob@example.com")


class UpdatePartnerTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        payload = AccountabilityPartnerUpdate(
            partner_name="Alice", partner_email="a@example.com", is_active=True,
        )
        with self.assertRaises(HTTPException) as ctx:
            await update_partner(uuid4(), payload, db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_updates_partner_fields(self):
        partner_id = uuid4()
        user_id = uuid4()
        partner = SimpleNamespace(
            id=partner_id, user_id=user_id,
            partner_name="Old", partner_email="old@example.com",
            relationship_label=None, is_active=True,
        )
        db = _mock_db_returning(partner)
        user = SimpleNamespace(id=user_id)
        payload = AccountabilityPartnerUpdate(
            partner_name="New", partner_email="new@example.com",
            relationship_label="friend", is_active=False,
        )
        await update_partner(partner_id, payload, db=db, current_user=user)
        self.assertEqual(partner.partner_name, "New")
        self.assertEqual(partner.partner_email, "new@example.com")
        self.assertFalse(partner.is_active)
        db.commit.assert_awaited_once()


class DeletePartnerTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found_returns_404(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        with self.assertRaises(HTTPException) as ctx:
            await delete_partner(uuid4(), db=db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_deletes_and_prunes_references(self):
        partner_id = uuid4()
        user_id = uuid4()
        partner = SimpleNamespace(id=partner_id, user_id=user_id)
        db = _mock_db_returning(partner)
        user = SimpleNamespace(id=user_id)
        with patch(
            "backend.routers.accountability_partners._prune_partner_references",
            new=AsyncMock(return_value=1),
        ) as prune_mock:
            await delete_partner(partner_id, db=db, current_user=user)
        prune_mock.assert_awaited_once()
        db.delete.assert_awaited_once_with(partner)
        db.commit.assert_awaited_once()


class GetAlertSettingsTest(unittest.IsolatedAsyncioTestCase):
    async def test_defaults_when_no_settings(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        result = await get_alert_settings(db=db, current_user=user)
        self.assertTrue(result.alerts_enabled)
        self.assertIsNone(result.custom_subject_template)

    async def test_returns_existing_settings(self):
        settings = SimpleNamespace(
            alerts_enabled=False, custom_subject_template="subj",
            custom_body_template="body", custom_message="msg",
        )
        db = _mock_db_returning(settings)
        user = SimpleNamespace(id=uuid4())
        result = await get_alert_settings(db=db, current_user=user)
        self.assertFalse(result.alerts_enabled)
        self.assertEqual(result.custom_subject_template, "subj")


class UpdateAlertSettingsTest(unittest.IsolatedAsyncioTestCase):
    async def test_creates_settings_when_none_exist(self):
        db = _mock_db_returning(None)
        user = SimpleNamespace(id=uuid4())
        payload = AccountabilityAlertSettingsUpdate(
            alerts_enabled=True, custom_message="watch out",
        )
        result = await update_alert_settings(payload, db=db, current_user=user)
        self.assertTrue(result.alerts_enabled)
        self.assertEqual(result.custom_message, "watch out")
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_updates_existing_settings(self):
        settings = SimpleNamespace(
            alerts_enabled=True, custom_subject_template=None,
            custom_body_template=None, custom_message=None,
        )
        db = _mock_db_returning(settings)
        user = SimpleNamespace(id=uuid4())
        payload = AccountabilityAlertSettingsUpdate(
            alerts_enabled=False, custom_message="no more",
        )
        result = await update_alert_settings(payload, db=db, current_user=user)
        self.assertFalse(result.alerts_enabled)
        db.commit.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
