import os
import unittest
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.application.auth import login_account, register_account, send_password_reset_link
from backend.application.counter import get_counter_value, increment_counter_value
from backend.application.transactions import ingest_user_transaction
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


class AuthServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_dev_seed_user_runs_in_production(self):
        user = SimpleNamespace(email="test@example.com")

        with patch(
            "backend.services.auth.settings",
            new=SimpleNamespace(
                APP_ENV="production",
                DEV_SEED_EXAMPLE_USER=True,
                DEV_SEED_EXAMPLE_EMAIL="test@example.com",
                DEV_SEED_EXAMPLE_PASSWORD="password123",
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
        hash_password_mock.assert_called_once_with("password123")
        create_user_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            email="test@example.com",
            password_hash="hashed-password",
            name="Test User",
            phone=None,
        )
        self.assertEqual(result, user)

    async def test_reset_password_accepts_legacy_naive_expiry_values(self):
        user = SimpleNamespace(
            reset_token="reset-token",
            reset_token_expires=datetime.utcnow() + timedelta(minutes=15),
            password_hash="old-hash",
        )

        with patch("backend.services.auth.get_user_by_reset_token", new=AsyncMock(return_value=user)), patch(
            "backend.services.auth.hash_password",
            return_value="new-hash",
        ) as hash_password_mock:
            await reset_password(object(), "reset-token", "password123")

        hash_password_mock.assert_called_once_with("password123")
        self.assertEqual(user.password_hash, "new-hash")
        self.assertIsNone(user.reset_token)
        self.assertIsNone(user.reset_token_expires)


class TransactionUseCaseTest(unittest.IsolatedAsyncioTestCase):
    async def test_ingest_user_transaction_sends_alert_for_flagged_transactions(self):
        classifier = SimpleNamespace(
            classify_transaction=AsyncMock(
                return_value=ClassificationResult(
                    flagged=True,
                    category="adult",
                    flag_reason="LLM: suspicious merchant pattern",
                )
            )
        )
        notifier = SimpleNamespace(send_transaction_alert=AsyncMock())
        db = SimpleNamespace(
            commit=AsyncMock(),
            rollback=AsyncMock(),
            refresh=AsyncMock(),
        )
        transaction = SimpleNamespace(
            id=uuid4(),
            user_id=uuid4(),
            merchant="Mystery Vendor",
            description="Recurring purchase",
            amount=Decimal("250.00"),
            category="adult",
            flagged=True,
            flag_reason="LLM: suspicious merchant pattern",
        )

        with patch(
            "backend.application.transactions.create_transaction",
            new=AsyncMock(return_value=transaction),
        ) as create_transaction_mock:
            result = await ingest_user_transaction(
                db,
                user_id=transaction.user_id,
                user_email="test@example.com",
                merchant="Mystery Vendor",
                description="Recurring purchase",
                amount=250.0,
                classifier=classifier,
                notifier=notifier,
            )

        classifier.classify_transaction.assert_awaited_once_with(
            merchant="Mystery Vendor",
            description="Recurring purchase",
            amount=250.0,
        )
        create_transaction_mock.assert_awaited_once_with(
            unittest.mock.ANY,
            user_id=transaction.user_id,
            merchant="Mystery Vendor",
            description="Recurring purchase",
            amount=250.0,
            category="adult",
            flagged=True,
            flag_reason="LLM: suspicious merchant pattern",
        )
        db.commit.assert_awaited_once()
        db.refresh.assert_awaited_once_with(transaction)
        notifier.send_transaction_alert.assert_awaited_once_with(
            to_email="test@example.com",
            merchant="Mystery Vendor",
            amount=250.0,
            category="adult",
            flag_reason="LLM: suspicious merchant pattern",
        )
        self.assertEqual(result, transaction)


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
