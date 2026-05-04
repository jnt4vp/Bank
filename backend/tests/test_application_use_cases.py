import os
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.application.auth import (
    build_password_reset_url,
    ensure_dev_seed_user_exists,
    login_account,
    register_account,
    send_password_reset_link,
)
from backend.application.counter import get_counter_value, increment_counter_value
from backend.application.transactions import CardLockedError, ingest_user_transaction
from backend.ports.classifier import ClassificationResult
from backend.services.auth import ensure_dev_seed_user, reset_password


class AuthUseCaseTest(unittest.IsolatedAsyncioTestCase):
    async def test_register_account_returns_user_and_token(self):
        user = SimpleNamespace(id=uuid4(), email="test@example.com")
        db = SimpleNamespace(
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )

        with patch("backend.application.auth.register_user", new=AsyncMock(return_value=user)) as register_user_mock, patch(
            "backend.application.auth.create_access_token",
            return_value="token-123",
        ) as create_access_token_mock:
            result = await register_account(
                db,
                name="Test User",
                email="test@example.com",
                password="password123",
                phone=None,
            )

        register_user_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            name="Test User",
            email="test@example.com",
            password="password123",
            phone=None,
        )
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(user)
        create_access_token_mock.assert_called_once_with(data={"sub": str(user.id)})
        self.assertEqual(result.user, user)
        self.assertEqual(result.access_token, "token-123")
        self.assertEqual(result.token_type, "bearer")

    async def test_login_account_returns_token(self):
        user = SimpleNamespace(id=uuid4())

        with patch("backend.application.auth.authenticate_user", new=AsyncMock(return_value=user)) as authenticate_user_mock, patch(
            "backend.application.auth.create_access_token",
            return_value="token-456",
        ) as create_access_token_mock:
            result = await login_account(
                object(),
                email="test@example.com",
                password="password123",
            )

        authenticate_user_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            "test@example.com",
            "password123",
        )
        create_access_token_mock.assert_called_once_with(data={"sub": str(user.id)})
        self.assertEqual(result.access_token, "token-456")
        self.assertEqual(result.token_type, "bearer")

    async def test_send_password_reset_link_sends_email_when_token_exists(self):
        notifier = SimpleNamespace(send_password_reset=AsyncMock())
        db = SimpleNamespace(
            commit=AsyncMock(),
            rollback=AsyncMock(),
        )

        with patch("backend.application.auth.generate_reset_token", new=AsyncMock(return_value="reset-token")) as generate_reset_token_mock, patch(
            "backend.application.auth.get_settings",
            return_value=SimpleNamespace(FRONTEND_URL="http://localhost:5173"),
        ):
            await send_password_reset_link(
                db,
                email="test@example.com",
                notifier=notifier,
            )

        generate_reset_token_mock.assert_awaited_once_with(db, "test@example.com")
        db.commit.assert_awaited_once()
        notifier.send_password_reset.assert_awaited_once_with(
            to_email="test@example.com",
            reset_url="http://localhost:5173/reset-password?token=reset-token",
        )

    def test_build_password_reset_url_strips_trailing_slash_on_base(self):
        with patch(
            "backend.application.auth.get_settings",
            return_value=SimpleNamespace(FRONTEND_URL="https://app.example.com/"),
        ):
            self.assertEqual(
                build_password_reset_url("t1"),
                "https://app.example.com/reset-password?token=t1",
            )

    async def test_ensure_dev_seed_user_exists_commits_modified_user(self):
        user = SimpleNamespace(email="test@example.com")
        db = SimpleNamespace(
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )

        with patch(
            "backend.application.auth.seed_dev_user",
            new=AsyncMock(return_value=user),
        ) as seed_dev_user_mock, patch(
            "backend.application.auth.inspect",
            return_value=SimpleNamespace(pending=False, modified=True),
        ):
            result = await ensure_dev_seed_user_exists(db)

        seed_dev_user_mock.assert_awaited_once_with(db)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(user)
        self.assertEqual(result, user)


class AuthServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_dev_seed_user_skips_in_production(self):
        with patch(
            "backend.services.auth.settings",
            new=SimpleNamespace(
                APP_ENV="production",
                DEV_SEED_EXAMPLE_USER=True,
                DEV_SEED_EXAMPLE_EMAIL="test@example.com",
                DEV_SEED_EXAMPLE_PASSWORD="Password123!",
                DEV_SEED_EXAMPLE_NAME="Test User",
            ),
        ), patch(
            "backend.services.auth.get_user_by_email",
            new=AsyncMock(),
        ) as get_user_by_email_mock, patch(
            "backend.services.auth.create_user",
            new=AsyncMock(),
        ) as create_user_mock:
            result = await ensure_dev_seed_user(object())

        get_user_by_email_mock.assert_not_awaited()
        create_user_mock.assert_not_awaited()
        self.assertIsNone(result)

    async def test_ensure_dev_seed_user_creates_in_development(self):
        user = SimpleNamespace(email="test@example.com")

        with patch(
            "backend.services.auth.settings",
            new=SimpleNamespace(
                APP_ENV="development",
                DEV_SEED_EXAMPLE_USER=True,
                DEV_SEED_EXAMPLE_EMAIL="test@example.com",
                DEV_SEED_EXAMPLE_PASSWORD="Password123!",
                DEV_SEED_EXAMPLE_NAME="Test User",
            ),
        ), patch(
            "backend.services.auth.get_user_by_email",
            new=AsyncMock(return_value=None),
        ) as get_user_by_email_mock, patch(
            "backend.services.auth.create_user",
            new=AsyncMock(return_value=user),
        ) as create_user_mock, patch(
            "backend.services.auth.hash_password",
            return_value="hashed-password",
        ) as hash_password_mock:
            result = await ensure_dev_seed_user(object())

        get_user_by_email_mock.assert_awaited_once_with(unittest.mock.ANY, "test@example.com")
        hash_password_mock.assert_called_once_with("Password123!")
        create_user_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            email="test@example.com",
            password_hash="hashed-password",
            name="Test User",
            phone=None,
        )
        self.assertEqual(result, user)

    async def test_ensure_dev_seed_user_resets_existing_password_drift(self):
        user = SimpleNamespace(email="test@example.com", password_hash="old-hash")

        with patch(
            "backend.services.auth.settings",
            new=SimpleNamespace(
                APP_ENV="development",
                DEV_SEED_EXAMPLE_USER=True,
                DEV_SEED_EXAMPLE_EMAIL="test@example.com",
                DEV_SEED_EXAMPLE_PASSWORD="Password123!",
                DEV_SEED_EXAMPLE_NAME="Test User",
            ),
        ), patch(
            "backend.services.auth.get_user_by_email",
            new=AsyncMock(return_value=user),
        ) as get_user_by_email_mock, patch(
            "backend.services.auth.verify_password",
            return_value=False,
        ) as verify_password_mock, patch(
            "backend.services.auth.hash_password",
            return_value="new-hash",
        ) as hash_password_mock, patch(
            "backend.services.auth.create_user",
            new=AsyncMock(),
        ) as create_user_mock:
            result = await ensure_dev_seed_user(object())

        get_user_by_email_mock.assert_awaited_once_with(unittest.mock.ANY, "test@example.com")
        verify_password_mock.assert_called_once_with("Password123!", "old-hash")
        hash_password_mock.assert_called_once_with("Password123!")
        create_user_mock.assert_not_awaited()
        self.assertEqual(user.password_hash, "new-hash")
        self.assertEqual(result, user)

    async def test_reset_password_accepts_legacy_naive_expiry_values(self):
        user = SimpleNamespace(
            id=uuid4(),
            reset_token="reset-token",
            reset_token_expires=datetime.utcnow() + timedelta(minutes=15),
            password_hash="old-hash",
        )

        with (
            patch(
                "backend.services.auth.get_user_by_reset_token",
                new=AsyncMock(return_value=user),
            ),
            patch("backend.services.auth._check_password_history", new=AsyncMock()),
            patch("backend.services.auth._save_password_history", new=AsyncMock()),
            patch("backend.services.auth.hash_password", return_value="new-hash") as hash_password_mock,
        ):
            await reset_password(object(), "reset-token", "password123")

        hash_password_mock.assert_called_once_with("password123")
        self.assertEqual(user.password_hash, "new-hash")
        self.assertIsNone(user.reset_token)
        self.assertIsNone(user.reset_token_expires)


class TransactionUseCaseTest(unittest.IsolatedAsyncioTestCase):
    async def test_ingest_user_transaction_does_not_flag_without_active_pacts(self):
        classifier = SimpleNamespace(classify_transaction=AsyncMock())
        notifier = SimpleNamespace(send_transaction_alert=AsyncMock())
        db = SimpleNamespace(
            flush=AsyncMock(),
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )
        transaction = SimpleNamespace(
            id=uuid4(),
            user_id=uuid4(),
            merchant="DraftKings",
            description="Weekly sports bet",
            amount=Decimal("250.00"),
            category=None,
            flagged=False,
            flag_reason=None,
            alert_sent=False,
            alert_sent_at=None,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
        )

        with patch(
            "backend.application.transactions.get_active_pact_categories",
            new=AsyncMock(return_value=[]),
        ), patch(
            "backend.application.transactions.create_transaction",
            new=AsyncMock(return_value=transaction),
        ) as create_transaction_mock, patch(
            "backend.application.transactions.ensure_discipline_window_after_manual_transaction",
            new=AsyncMock(),
        ), patch(
            "backend.application.transactions.record_simulated_savings_transfers_for_transaction",
            new=AsyncMock(return_value=0),
        ):
            result = await ingest_user_transaction(
                db,
                user_id=transaction.user_id,
                user_email="test@example.com",
                merchant="DraftKings",
                description="Weekly sports bet",
                amount=250.0,
                classifier=classifier,
                notifier=notifier,
            )

        classifier.classify_transaction.assert_not_awaited()
        create_transaction_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            user_id=transaction.user_id,
            merchant="DraftKings",
            description="Weekly sports bet",
            amount=250.0,
            category=None,
            flagged=False,
            flag_reason=None,
        )
        db.flush.assert_awaited_once()
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(transaction)
        notifier.send_transaction_alert.assert_not_awaited()
        self.assertEqual(result, transaction)

    async def test_ingest_user_transaction_sends_alert_for_flagged_pact_transactions(self):
        classifier = SimpleNamespace(
            classify_transaction=AsyncMock(
                return_value=ClassificationResult(
                    flagged=True,
                    category="non-essential spending",
                    flag_reason="LLM: matched discretionary spending",
                )
            )
        )
        notifier = SimpleNamespace(send_transaction_alert=AsyncMock())
        db = SimpleNamespace(
            flush=AsyncMock(),
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )
        transaction = SimpleNamespace(
            id=uuid4(),
            user_id=uuid4(),
            merchant="Luxury Boutique",
            description="Impulse clothing purchase",
            amount=Decimal("180.00"),
            category="non-essential spending",
            flagged=True,
            flag_reason="LLM: matched discretionary spending",
            alert_sent=False,
            alert_sent_at=None,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
        )

        with patch(
            "backend.application.transactions.get_active_pact_categories",
            new=AsyncMock(return_value=["non-essential spending"]),
        ), patch(
            "backend.application.transactions.create_transaction",
            new=AsyncMock(return_value=transaction),
        ) as create_transaction_mock, patch(
            "backend.application.transactions.ensure_discipline_window_after_manual_transaction",
            new=AsyncMock(),
        ), patch(
            "backend.application.transactions.record_simulated_savings_transfers_for_transaction",
            new=AsyncMock(return_value=0),
        ), patch(
            "backend.application.transactions.extend_card_lock",
            new=AsyncMock(),
        ) as extend_lock_mock:
            result = await ingest_user_transaction(
                db,
                user_id=transaction.user_id,
                user_email="test@example.com",
                merchant="Luxury Boutique",
                description="Impulse clothing purchase",
                amount=180.0,
                classifier=classifier,
                notifier=notifier,
            )

        classifier.classify_transaction.assert_awaited_once_with(
            merchant="Luxury Boutique",
            description="Impulse clothing purchase",
            amount=180.0,
            user_categories=["non-essential spending"],
        )
        create_transaction_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            user_id=transaction.user_id,
            merchant="Luxury Boutique",
            description="Impulse clothing purchase",
            amount=180.0,
            category="non-essential spending",
            flagged=True,
            flag_reason="LLM: matched discretionary spending",
        )
        db.flush.assert_awaited_once()
        self.assertEqual(db.commit.await_count, 2)
        db.refresh.assert_awaited_once_with(transaction)
        notifier.send_transaction_alert.assert_awaited_once_with(
            to_email="test@example.com",
            merchant="Luxury Boutique",
            amount=180.0,
            category="non-essential spending",
            flag_reason="LLM: matched discretionary spending",
        )
        self.assertTrue(transaction.alert_sent)
        self.assertIsNotNone(transaction.alert_sent_at)
        self.assertEqual(result, transaction)
        extend_lock_mock.assert_awaited_once()

    async def test_ingest_skips_extend_when_auto_lock_disabled(self):
        classifier = SimpleNamespace(
            classify_transaction=AsyncMock(
                return_value=ClassificationResult(
                    flagged=True,
                    category="Coffee Shops",
                    flag_reason="keyword",
                )
            )
        )
        notifier = SimpleNamespace(send_transaction_alert=AsyncMock())
        transaction = SimpleNamespace(
            id=uuid4(),
            user_id=uuid4(),
            merchant="Starbucks",
            description="Coffee",
            amount=Decimal("5.50"),
            category="Coffee Shops",
            flagged=True,
            flag_reason="keyword",
            alert_sent=False,
            alert_sent_at=None,
            accountability_alert_sent=False,
            accountability_alert_sent_at=None,
            created_at=datetime.now(timezone.utc),
            plaid_transaction_id=None,
            plaid_original_description=None,
            date=None,
            pending=False,
        )
        db = SimpleNamespace(
            flush=AsyncMock(),
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )

        with patch(
            "backend.application.transactions.get_active_pact_categories",
            new=AsyncMock(return_value=["Coffee Shops"]),
        ), patch(
            "backend.application.transactions.create_transaction",
            new=AsyncMock(return_value=transaction),
        ), patch(
            "backend.application.transactions.ensure_discipline_window_after_manual_transaction",
            new=AsyncMock(),
        ), patch(
            "backend.application.transactions.record_simulated_savings_transfers_for_transaction",
            new=AsyncMock(return_value=0),
        ), patch(
            "backend.application.transactions.extend_card_lock",
            new=AsyncMock(),
        ) as extend_lock_mock:
            await ingest_user_transaction(
                db,
                user_id=transaction.user_id,
                user_email="test@example.com",
                merchant="Starbucks",
                description="Coffee",
                amount=5.5,
                classifier=classifier,
                notifier=notifier,
                card_lock_auto_enabled=False,
            )

        extend_lock_mock.assert_not_awaited()

    async def test_ingest_user_transaction_raises_when_card_locked(self):
        classifier = SimpleNamespace(classify_transaction=AsyncMock())
        notifier = SimpleNamespace(send_transaction_alert=AsyncMock())
        db = SimpleNamespace(
            flush=AsyncMock(), commit=AsyncMock(),
            rollback=AsyncMock(), refresh=AsyncMock(),
        )
        with patch(
            "backend.application.transactions.get_active_pact_categories",
            new=AsyncMock(return_value=[]),
        ), patch(
            "backend.application.transactions.create_transaction",
            new=AsyncMock(),
        ) as create_mock:
            with self.assertRaises(CardLockedError):
                await ingest_user_transaction(
                    db,
                    user_id=uuid4(),
                    user_email="u@example.com",
                    merchant="Any",
                    description="Any",
                    amount=10.0,
                    classifier=classifier,
                    notifier=notifier,
                    card_locked_until=datetime.now(timezone.utc) + timedelta(hours=1),
                )
        classifier.classify_transaction.assert_not_awaited()
        create_mock.assert_not_awaited()
        db.flush.assert_not_awaited()
        db.commit.assert_not_awaited()


class CounterUseCaseTest(unittest.IsolatedAsyncioTestCase):
    async def test_get_counter_value_commits_only_for_new_counter(self):
        counter = SimpleNamespace(value=0)
        db = SimpleNamespace(
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )

        with patch("backend.application.counter.get_or_create_counter", new=AsyncMock(return_value=counter)), patch(
            "backend.application.counter.inspect",
            return_value=SimpleNamespace(pending=True),
        ):
            result = await get_counter_value(db)

        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(counter)
        self.assertEqual(result, counter)

    async def test_increment_counter_value_commits_and_refreshes(self):
        counter = SimpleNamespace(value=1)
        db = SimpleNamespace(
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )

        with patch("backend.application.counter.increment_counter", new=AsyncMock(return_value=counter)) as increment_counter_mock:
            result = await increment_counter_value(db)

        increment_counter_mock.assert_awaited_once_with(db)
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(counter)
        self.assertEqual(result, counter)
