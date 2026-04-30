"""Tests for backend.services.card_lock.extend_card_lock."""

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.card_lock import extend_card_lock, lock_duration


class ExtendCardLockTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_now_plus_default_duration(self):
        db = AsyncMock()
        before = datetime.now(timezone.utc)
        result = await extend_card_lock(db, user_id=uuid4())
        after = datetime.now(timezone.utc)

        # The proposed timestamp should equal now (at call time) + lock_duration.
        # Tolerate ~5s of test clock drift.
        expected_low = before + lock_duration() - timedelta(seconds=5)
        expected_high = after + lock_duration() + timedelta(seconds=5)
        self.assertGreaterEqual(result, expected_low)
        self.assertLessEqual(result, expected_high)
        db.execute.assert_awaited_once()

    async def test_accepts_custom_duration(self):
        db = AsyncMock()
        five_min = timedelta(minutes=5)
        before = datetime.now(timezone.utc)
        result = await extend_card_lock(db, user_id=uuid4(), duration=five_min)

        delta = result - before
        # Should be ~5 minutes, give or take test scheduling jitter
        self.assertGreaterEqual(delta, five_min - timedelta(seconds=1))
        self.assertLessEqual(delta, five_min + timedelta(seconds=5))


if __name__ == "__main__":
    unittest.main()
