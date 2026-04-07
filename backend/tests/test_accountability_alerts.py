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
        partner = SimpleNamespace(partner_name="Alex", partner_email="alex@test.com")
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[
                _ScalarResult(user),
                _ScalarResult(settings),
                _ListResult([partner]),
            ])
        )
        notifier = SimpleNamespace(send_accountability_alert=AsyncMock())

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
