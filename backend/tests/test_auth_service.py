"""Direct tests for backend.services.auth — no HTTP layer, minimal mocking."""

import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.auth import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidResetTokenError,
    PasswordReusedError,
    _as_utc,
    _check_password_history,
    authenticate_user,
    generate_reset_token,
    register_user,
    reset_password,
)


class RegisterUserTest(unittest.IsolatedAsyncioTestCase):
    async def test_raises_duplicate_email_when_user_exists(self):
        existing = SimpleNamespace(id=uuid4(), email="dup@example.com")
        db = AsyncMock()

        with patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=existing)):
            with self.assertRaises(DuplicateEmailError):
                await register_user(db, name="A", email="dup@example.com", password="Str0ng!Pass", phone=None)

    async def test_creates_user_and_saves_password_history(self):
        user = SimpleNamespace(id=uuid4())
        db = AsyncMock()

        with (
            patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=None)),
            patch("backend.services.auth.hash_password", return_value="hashed"),
            patch("backend.services.auth.create_user", new=AsyncMock(return_value=user)) as create_mock,
            patch("backend.services.auth._save_password_history", new=AsyncMock()) as save_hist,
        ):
            result = await register_user(db, name="A", email="a@example.com", password="Str0ng!Pass", phone="555")

        create_mock.assert_awaited_once()
        db.flush.assert_awaited_once()
        save_hist.assert_awaited_once_with(db, user.id, "hashed")
        self.assertEqual(result, user)


class AuthenticateUserTest(unittest.IsolatedAsyncioTestCase):
    async def test_raises_when_user_not_found(self):
        with patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=None)):
            with self.assertRaises(InvalidCredentialsError):
                await authenticate_user(object(), "no@example.com", "pass")

    async def test_raises_when_password_wrong(self):
        user = SimpleNamespace(password_hash="hash")
        with (
            patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=user)),
            patch("backend.services.auth.verify_password", return_value=False),
        ):
            with self.assertRaises(InvalidCredentialsError):
                await authenticate_user(object(), "u@example.com", "wrong")

    async def test_returns_user_on_valid_credentials(self):
        user = SimpleNamespace(password_hash="hash")
        with (
            patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=user)),
            patch("backend.services.auth.verify_password", return_value=True),
        ):
            result = await authenticate_user(object(), "u@example.com", "correct")
        self.assertEqual(result, user)


class GenerateResetTokenTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_none_when_email_not_found(self):
        with patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=None)):
            result = await generate_reset_token(object(), "no@example.com")
        self.assertIsNone(result)

    async def test_returns_token_and_sets_expiry(self):
        user = SimpleNamespace(reset_token=None, reset_token_expires=None)
        with patch("backend.services.auth.get_user_by_email", new=AsyncMock(return_value=user)):
            result = await generate_reset_token(object(), "u@example.com")
        self.assertIsNotNone(result)
        self.assertIsNotNone(user.reset_token)
        self.assertIsNotNone(user.reset_token_expires)
        self.assertGreater(user.reset_token_expires, datetime.now(timezone.utc))


class ResetPasswordTest(unittest.IsolatedAsyncioTestCase):
    async def test_raises_invalid_token_when_user_not_found(self):
        with patch("backend.services.auth.get_user_by_reset_token", new=AsyncMock(return_value=None)):
            with self.assertRaises(InvalidResetTokenError):
                await reset_password(object(), "bad-token", "NewPass1!")

    async def test_raises_invalid_token_when_expired(self):
        user = SimpleNamespace(
            id=uuid4(),
            reset_token_expires=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        with patch("backend.services.auth.get_user_by_reset_token", new=AsyncMock(return_value=user)):
            with self.assertRaises(InvalidResetTokenError):
                await reset_password(object(), "expired-token", "NewPass1!")

    async def test_raises_password_reused(self):
        user = SimpleNamespace(
            id=uuid4(),
            reset_token_expires=datetime.now(timezone.utc) + timedelta(hours=1),
            password_hash="old",
            reset_token="tok",
        )
        with (
            patch("backend.services.auth.get_user_by_reset_token", new=AsyncMock(return_value=user)),
            patch("backend.services.auth._check_password_history", new=AsyncMock(side_effect=PasswordReusedError)),
        ):
            with self.assertRaises(PasswordReusedError):
                await reset_password(object(), "tok", "OldPass1!")

    async def test_success_clears_token(self):
        user = SimpleNamespace(
            id=uuid4(),
            reset_token="tok",
            reset_token_expires=datetime.now(timezone.utc) + timedelta(hours=1),
            password_hash="old",
        )
        with (
            patch("backend.services.auth.get_user_by_reset_token", new=AsyncMock(return_value=user)),
            patch("backend.services.auth._check_password_history", new=AsyncMock()),
            patch("backend.services.auth._save_password_history", new=AsyncMock()),
            patch("backend.services.auth.hash_password", return_value="new-hash"),
        ):
            await reset_password(object(), "tok", "NewStr0ng!")

        self.assertEqual(user.password_hash, "new-hash")
        self.assertIsNone(user.reset_token)
        self.assertIsNone(user.reset_token_expires)


class CheckPasswordHistoryTest(unittest.IsolatedAsyncioTestCase):
    async def test_raises_when_password_matches_recent_hash(self):
        entry = SimpleNamespace(password_hash="hash1")

        class _ScalarResult:
            def all(self):
                return [entry]

        class _ExecResult:
            def scalars(self):
                return _ScalarResult()

        db = AsyncMock()
        db.execute = AsyncMock(return_value=_ExecResult())

        with patch("backend.services.auth.verify_password", return_value=True):
            with self.assertRaises(PasswordReusedError):
                await _check_password_history(db, uuid4(), "reused-password")

    async def test_passes_when_no_match(self):
        entry = SimpleNamespace(password_hash="hash1")

        class _ScalarResult:
            def all(self):
                return [entry]

        class _ExecResult:
            def scalars(self):
                return _ScalarResult()

        db = AsyncMock()
        db.execute = AsyncMock(return_value=_ExecResult())

        with patch("backend.services.auth.verify_password", return_value=False):
            # Should not raise
            await _check_password_history(db, uuid4(), "new-password")


class AsUtcTest(unittest.TestCase):
    def test_naive_datetime_gets_utc(self):
        naive = datetime(2024, 1, 1, 12, 0, 0)
        result = _as_utc(naive)
        self.assertEqual(result.tzinfo, timezone.utc)

    def test_aware_datetime_stays_utc(self):
        aware = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        result = _as_utc(aware)
        self.assertEqual(result, aware)


if __name__ == "__main__":
    unittest.main()
