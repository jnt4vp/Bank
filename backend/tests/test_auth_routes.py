"""Tests for backend.routers.auth — validates HTTP status codes and error handling."""

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.routers.auth import (
    do_reset_password,
    forgot_password,
    get_me,
    login,
    register,
    update_me,
)
from backend.schemas.auth import ForgotPasswordRequest, LoginRequest, ResetPasswordRequest
from backend.schemas.user import UserCreate, UserUpdate
from backend.security import PasswordValidationError
from backend.services.auth import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidResetTokenError,
    PasswordReusedError,
)

from fastapi import HTTPException


class RegisterRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_duplicate_email_returns_400(self):
        user_data = UserCreate(name="A", email="a@example.com", password="Str0ng!Pass1")
        with patch("backend.routers.auth.register_account", new=AsyncMock(side_effect=DuplicateEmailError)):
            with self.assertRaises(HTTPException) as ctx:
                await register(user_data, db=AsyncMock())
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Email already registered", ctx.exception.detail)

    async def test_weak_password_returns_400(self):
        user_data = UserCreate(name="A", email="a@example.com", password="weak")
        with patch(
            "backend.routers.auth.register_account",
            new=AsyncMock(side_effect=PasswordValidationError("too short")),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await register(user_data, db=AsyncMock())
            self.assertEqual(ctx.exception.status_code, 400)

    async def test_successful_registration_returns_auth_response(self):
        user = SimpleNamespace(
            id=uuid4(), email="a@example.com", phone=None, name="A",
            card_locked_until=None, card_lock_auto_enabled=True,
            discipline_savings_percentage=0,
            discipline_score=100, discipline_ui_mode="discipline",
            dashboard_force_sky=False, discipline_score_started_at=None,
            bank_connected_at=None, created_at=datetime.now(timezone.utc),
        )
        result = SimpleNamespace(user=user, access_token="tok", token_type="bearer")
        with patch("backend.routers.auth.register_account", new=AsyncMock(return_value=result)):
            resp = await register(
                UserCreate(name="A", email="a@example.com", password="Str0ng!Pass1"),
                db=AsyncMock(),
            )
        self.assertEqual(resp.access_token, "tok")


class LoginRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_credentials_returns_401(self):
        with patch("backend.routers.auth.login_account", new=AsyncMock(side_effect=InvalidCredentialsError)):
            with self.assertRaises(HTTPException) as ctx:
                await login(LoginRequest(email="a@example.com", password="wrong"), db=AsyncMock())
            self.assertEqual(ctx.exception.status_code, 401)

    async def test_successful_login_returns_token(self):
        result = SimpleNamespace(access_token="tok-123", token_type="bearer")
        with patch("backend.routers.auth.login_account", new=AsyncMock(return_value=result)):
            resp = await login(LoginRequest(email="a@example.com", password="Str0ng!Pass1"), db=AsyncMock())
        self.assertEqual(resp.access_token, "tok-123")


class GetMeRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_refreshes_discipline_score(self):
        user = SimpleNamespace(
            id=uuid4(), discipline_score_started_at=datetime.now(timezone.utc),
            discipline_score=100, email="a@example.com", phone=None, name="A",
            card_locked_until=None, card_lock_auto_enabled=True,
            discipline_savings_percentage=0,
            discipline_ui_mode="discipline", dashboard_force_sky=False,
            bank_connected_at=None, created_at=datetime.now(timezone.utc),
        )
        db = AsyncMock()
        with (
            patch("backend.routers.auth.count_transactions_for_discipline_score", new=AsyncMock(return_value=(10, 2))),
            patch("backend.routers.auth.calculate_discipline_score", return_value=80),
        ):
            result = await get_me(current_user=user, db=db)
        self.assertEqual(user.discipline_score, 80)
        db.commit.assert_awaited_once()


class UpdateMeRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_update_savings_percentage(self):
        user = SimpleNamespace(
            discipline_savings_percentage=0, discipline_ui_mode="discipline",
            dashboard_force_sky=False, discipline_score_started_at=None,
        )
        db = AsyncMock()
        payload = UserUpdate(discipline_savings_percentage=15.0)
        await update_me(payload, current_user=user, db=db)
        self.assertEqual(user.discipline_savings_percentage, 15.0)
        db.commit.assert_awaited_once()

    async def test_invalid_ui_mode_returns_400(self):
        user = SimpleNamespace(
            discipline_savings_percentage=0, discipline_ui_mode="discipline",
            dashboard_force_sky=False, discipline_score_started_at=None,
        )
        payload = UserUpdate(discipline_ui_mode="invalid")
        with self.assertRaises(HTTPException) as ctx:
            await update_me(payload, current_user=user, db=AsyncMock())
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_reset_discipline_window_recomputes_score(self):
        user = SimpleNamespace(
            discipline_savings_percentage=0, discipline_ui_mode="discipline",
            dashboard_force_sky=False, discipline_score_started_at=None,
            id=uuid4(), discipline_score=100,
        )
        db = AsyncMock()
        payload = UserUpdate(reset_discipline_window=True)
        with (
            patch("backend.routers.auth.count_transactions_for_discipline_score", new=AsyncMock(return_value=(0, 0))),
            patch("backend.routers.auth.calculate_discipline_score", return_value=100),
        ):
            await update_me(payload, current_user=user, db=db)
        self.assertIsNotNone(user.discipline_score_started_at)
        db.commit.assert_awaited_once()

    async def test_card_locked_false_clears_lock(self):
        uid = uuid4()
        until = datetime.now(timezone.utc)
        user = SimpleNamespace(
            id=uid,
            card_locked_until=until,
            card_lock_auto_enabled=True,
            discipline_savings_percentage=0,
            discipline_ui_mode="discipline",
            dashboard_force_sky=False,
            discipline_score_started_at=None,
        )
        db = AsyncMock()
        payload = UserUpdate(card_locked=False)
        await update_me(payload, current_user=user, db=db)
        self.assertIsNone(user.card_locked_until)
        db.commit.assert_awaited_once()

    async def test_card_locked_true_calls_extend_lock(self):
        uid = uuid4()
        user = SimpleNamespace(
            id=uid,
            card_locked_until=None,
            card_lock_auto_enabled=True,
            discipline_savings_percentage=0,
            discipline_ui_mode="discipline",
            dashboard_force_sky=False,
            discipline_score_started_at=None,
        )
        db = AsyncMock()
        payload = UserUpdate(card_locked=True)
        with patch("backend.routers.auth.extend_card_lock", new=AsyncMock()) as ext:
            await update_me(payload, current_user=user, db=db)
        ext.assert_awaited_once_with(db, user_id=uid)
        db.commit.assert_awaited_once()


class ForgotPasswordRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_always_returns_200_even_for_unknown_email(self):
        notifier = SimpleNamespace(send_password_reset=AsyncMock())
        with patch("backend.routers.auth.send_password_reset_link", new=AsyncMock()):
            resp = await forgot_password(
                ForgotPasswordRequest(email="unknown@example.com"),
                db=AsyncMock(),
                notifier=notifier,
            )
        self.assertIn("message", resp)


class ResetPasswordRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_password_reused_returns_400(self):
        with patch(
            "backend.routers.auth.reset_account_password",
            new=AsyncMock(side_effect=PasswordReusedError),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await do_reset_password(
                    ResetPasswordRequest(token="tok", new_password="OldPass1!"),
                    db=AsyncMock(),
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("recently", ctx.exception.detail)

    async def test_invalid_token_returns_400(self):
        with patch(
            "backend.routers.auth.reset_account_password",
            new=AsyncMock(side_effect=InvalidResetTokenError),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await do_reset_password(
                    ResetPasswordRequest(token="bad", new_password="NewPass1!"),
                    db=AsyncMock(),
                )
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("expired", ctx.exception.detail)

    async def test_success_returns_message(self):
        with patch("backend.routers.auth.reset_account_password", new=AsyncMock()):
            resp = await do_reset_password(
                ResetPasswordRequest(token="valid", new_password="NewPass1!"),
                db=AsyncMock(),
            )
        self.assertIn("Password updated", resp["message"])


if __name__ == "__main__":
    unittest.main()
