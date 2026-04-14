import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from backend.services.accountability_alerts import send_accountability_alerts_for_transaction


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ListResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items

    def unique(self):
        return self


class AccountabilityAlertsTest(unittest.IsolatedAsyncioTestCase):
    async def test_sends_once_and_sets_tracking_fields(self):
        txn = SimpleNamespace(
            id=uuid4(),
            flagged=True,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            category="gambling",
            amount=42.50,
            merchant="Test Merchant",
            description="Bet",
            date=date(2026, 4, 7),
        )
        user = SimpleNamespace(name="Test User", email="user@test.com")
        settings = SimpleNamespace(
            alerts_enabled=True,
            custom_subject_template="Heads up {partner_name}",
            custom_body_template="Merchant: {merchant}; Message: {custom_message}",
            custom_message="Please keep me accountable.",
        )
        partner = SimpleNamespace(id=uuid4(), partner_name="Alex", partner_email="alex@test.com")
        pact_settings = SimpleNamespace(
            accountability_type="friend",
            accountability_partner_ids=[str(partner.id)],
        )
        pact = SimpleNamespace(
            custom_category=None,
            category="gambling",
            preset_category=None,
            accountability_settings=pact_settings,
        )
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                _ScalarResult(user),
                _ScalarResult(settings),
                _ListResult([pact]),
                _ListResult([partner]),
            ])
        )
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock(return_value=True))

        sent = await send_accountability_alerts_for_transaction(
            db,
            notifier=notifier,
            transaction=txn,
            user_id=uuid4(),
        )

        self.assertTrue(sent)
        notifier.send_accountability_alert.assert_awaited_once()
        self.assertTrue(txn.accountability_alert_sent)
        self.assertIsNotNone(txn.accountability_alert_sent_at)

    async def test_sends_when_partner_ids_exist_without_friend_type_flag(self):
        txn = SimpleNamespace(
            id=uuid4(),
            flagged=True,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            category="gambling",
            amount=42.50,
            merchant="Test Merchant",
            description="Bet",
            date=date(2026, 4, 7),
        )
        user = SimpleNamespace(name="Test User", email="user@test.com")
        settings = SimpleNamespace(
            alerts_enabled=True,
            custom_subject_template=None,
            custom_body_template=None,
            custom_message=None,
        )
        partner = SimpleNamespace(id=uuid4(), partner_name="Alex", partner_email="alex@test.com")
        pact_settings = SimpleNamespace(
            accountability_type=None,
            accountability_partner_ids=[str(partner.id)],
        )
        pact = SimpleNamespace(
            custom_category=None,
            category="gambling",
            preset_category=None,
            accountability_settings=pact_settings,
        )
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                _ScalarResult(user),
                _ScalarResult(settings),
                _ListResult([pact]),
                _ListResult([partner]),
            ])
        )
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock(return_value=True))

        sent = await send_accountability_alerts_for_transaction(
            db,
            notifier=notifier,
            transaction=txn,
            user_id=uuid4(),
        )

        self.assertTrue(sent)
        notifier.send_accountability_alert.assert_awaited_once()

    async def test_skips_when_already_sent(self):
        txn = SimpleNamespace(
            flagged=True,
            accountability_alert_sent=True,
            accountability_alert_sent_at=None,
        )
        db = SimpleNamespace(execute=AsyncMock())
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock())

        sent = await send_accountability_alerts_for_transaction(
            db,
            notifier=notifier,
            transaction=txn,
            user_id=uuid4(),
        )

        self.assertFalse(sent)
        notifier.send_accountability_alert.assert_not_awaited()

    async def test_legacy_friend_settings_fall_back_to_all_active_partners(self):
        txn = SimpleNamespace(
            id=uuid4(),
            flagged=True,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            category="shopping",
            amount=18.00,
            merchant="Mall",
            description="Store purchase",
            date=date(2026, 4, 10),
        )
        user = SimpleNamespace(name="Test User", email="user@test.com")
        settings = SimpleNamespace(
            alerts_enabled=True,
            custom_subject_template=None,
            custom_body_template=None,
            custom_message=None,
        )
        partner = SimpleNamespace(id=uuid4(), partner_name="Jordan", partner_email="jordan@test.com")
        pact_settings = SimpleNamespace(
            accountability_type="friend",
            accountability_partner_ids=[],
        )
        pact = SimpleNamespace(
            custom_category=None,
            category="shopping",
            preset_category=None,
            accountability_settings=pact_settings,
        )
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                _ScalarResult(user),
                _ScalarResult(settings),
                _ListResult([pact]),
                _ListResult([partner]),
            ])
        )
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock(return_value=True))

        sent = await send_accountability_alerts_for_transaction(
            db,
            notifier=notifier,
            transaction=txn,
            user_id=uuid4(),
        )

        self.assertTrue(sent)
        notifier.send_accountability_alert.assert_awaited_once()

    async def test_logs_when_no_matching_pacts_are_found(self):
        txn = SimpleNamespace(
            id=uuid4(),
            flagged=True,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            category="groceries",
            amount=24.00,
            merchant="Corner Market",
            description="Food",
            date=date(2026, 4, 10),
        )
        user = SimpleNamespace(name="Test User", email="user@test.com")
        settings = SimpleNamespace(
            alerts_enabled=True,
            custom_subject_template=None,
            custom_body_template=None,
            custom_message=None,
        )
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                _ScalarResult(user),
                _ScalarResult(settings),
                _ListResult([]),
            ])
        )
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock(return_value=True))

        with self.assertLogs("bank.accountability", level="INFO") as logs:
            sent = await send_accountability_alerts_for_transaction(
                db,
                notifier=notifier,
                transaction=txn,
                user_id=uuid4(),
            )

        self.assertFalse(sent)
        notifier.send_accountability_alert.assert_not_awaited()
        self.assertIn(
            "no matching friend-accountability pacts",
            "\n".join(logs.output),
        )

    async def test_does_not_mark_sent_when_notifier_reports_no_delivery(self):
        txn = SimpleNamespace(
            id=uuid4(),
            flagged=True,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            category="gambling",
            amount=42.50,
            merchant="Test Merchant",
            description="Bet",
            date=date(2026, 4, 7),
        )
        user = SimpleNamespace(name="Test User", email="user@test.com")
        settings = SimpleNamespace(
            alerts_enabled=True,
            custom_subject_template="Heads up {partner_name}",
            custom_body_template="Merchant: {merchant}; Message: {custom_message}",
            custom_message="Please keep me accountable.",
        )
        partner = SimpleNamespace(id=uuid4(), partner_name="Alex", partner_email="alex@test.com")
        pact_settings = SimpleNamespace(
            accountability_type="friend",
            accountability_partner_ids=[str(partner.id)],
        )
        pact = SimpleNamespace(
            custom_category=None,
            category="gambling",
            preset_category=None,
            accountability_settings=pact_settings,
        )
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                _ScalarResult(user),
                _ScalarResult(settings),
                _ListResult([pact]),
                _ListResult([partner]),
            ])
        )
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock(return_value=False))

        with self.assertLogs("bank.accountability", level="WARNING") as logs:
            sent = await send_accountability_alerts_for_transaction(
                db,
                notifier=notifier,
                transaction=txn,
                user_id=uuid4(),
            )

        self.assertFalse(sent)
        notifier.send_accountability_alert.assert_awaited_once()
        self.assertFalse(txn.accountability_alert_sent)
        self.assertIsNone(txn.accountability_alert_sent_at)
        joined_logs = "\n".join(logs.output)
        self.assertIn("not delivered", joined_logs)
        self.assertIn("after 1 attempt", joined_logs)
