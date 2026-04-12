import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from backend.schemas.user import UserUpdate
from backend.services.discipline import (
    calculate_discipline_score,
    count_transactions_for_discipline_score,
    normalize_discipline_start,
    resolve_discipline_score_cutoff_after_bank_sync,
)


class DisciplineScoreTest(unittest.TestCase):
    def test_defaults_to_perfect_when_no_transactions(self):
        self.assertEqual(
            calculate_discipline_score(total_transactions=0, flagged_transactions=0),
            100,
        )

    def test_midpoint_score(self):
        self.assertEqual(
            calculate_discipline_score(total_transactions=10, flagged_transactions=4),
            60,
        )

    def test_never_below_zero(self):
        self.assertEqual(
            calculate_discipline_score(total_transactions=2, flagged_transactions=20),
            0,
        )


class UserUpdateDashboardForceSkyTest(unittest.TestCase):
    def test_dashboard_force_sky_optional_on_patch(self):
        self.assertIsNone(UserUpdate().dashboard_force_sky)
        self.assertIs(UserUpdate(dashboard_force_sky=True).dashboard_force_sky, True)
        self.assertIs(UserUpdate(dashboard_force_sky=False).dashboard_force_sky, False)

    def test_reset_discipline_window_optional(self):
        self.assertIsNone(UserUpdate().reset_discipline_window)
        self.assertIs(UserUpdate(reset_discipline_window=True).reset_discipline_window, True)


class ResolveDisciplineCutoffTest(unittest.TestCase):
    def test_max_before_clock_uses_wall_clock(self):
        t = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        older = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(
            resolve_discipline_score_cutoff_after_bank_sync(
                clock_now=t,
                max_transaction_created_at=older,
            ),
            t,
        )

    def test_no_transactions_uses_wall_clock(self):
        t = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(
            resolve_discipline_score_cutoff_after_bank_sync(
                clock_now=t,
                max_transaction_created_at=None,
            ),
            t,
        )

    def test_import_batch_same_instant_bumped_past_max_created(self):
        clock = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        max_ca = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        out = resolve_discipline_score_cutoff_after_bank_sync(
            clock_now=clock,
            max_transaction_created_at=max_ca,
        )
        self.assertEqual(out, max_ca + timedelta(microseconds=1))


class NormalizeDisciplineStartTest(unittest.TestCase):
    def test_naive_datetime_assumes_utc(self):
        naive = datetime(2026, 1, 1, 12, 0, 0)
        out = normalize_discipline_start(naive)
        self.assertEqual(out.tzinfo, timezone.utc)


class CountTransactionsForDisciplineScoreTest(unittest.IsolatedAsyncioTestCase):
    async def test_none_window_returns_zeros_without_query(self):
        session = AsyncMock()
        total, flagged = await count_transactions_for_discipline_score(
            session,
            user_id=uuid4(),
            discipline_score_started_at=None,
        )
        self.assertEqual((total, flagged), (0, 0))
        session.execute.assert_not_called()

    async def test_aggregates_from_session_execute(self):
        r1 = MagicMock()
        r1.scalar_one.return_value = 4
        r2 = MagicMock()
        r2.scalar_one.return_value = 1
        session = AsyncMock()
        session.execute = AsyncMock(side_effect=[r1, r2])
        uid = uuid4()
        start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        total, flagged = await count_transactions_for_discipline_score(
            session,
            user_id=uid,
            discipline_score_started_at=start,
        )
        self.assertEqual(total, 4)
        self.assertEqual(flagged, 1)
        self.assertEqual(session.execute.await_count, 2)
