"""
Behavioral model for discipline scoring window (mirrors SQL: created_at >= started_at).
Each row is (created_at, flagged).
"""
from __future__ import annotations

import unittest
from datetime import datetime, timezone, timedelta

from backend.services.discipline import calculate_discipline_score


def _window_counts(rows: list[tuple[datetime, bool]], started_at: datetime) -> tuple[int, int]:
    in_window = [(created, flagged) for created, flagged in rows if created >= started_at]
    total = len(in_window)
    flagged_n = sum(1 for _, f in in_window if f)
    return total, flagged_n


class DisciplineWindowScenariosTest(unittest.TestCase):
    def test_existing_user_historical_flagged_ignored(self):
        started_at = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        rows = [
            (datetime(2025, 1, 1, tzinfo=timezone.utc), True),
            (datetime(2025, 2, 1, tzinfo=timezone.utc), True),
            (datetime(2026, 6, 10, tzinfo=timezone.utc), False),
        ]
        total, flagged = _window_counts(rows, started_at)
        self.assertEqual(total, 1)
        self.assertEqual(flagged, 0)
        self.assertEqual(
            calculate_discipline_score(total_transactions=total, flagged_transactions=flagged),
            100,
        )

    def test_mixed_only_after_start_affect_score(self):
        started_at = datetime(2026, 1, 15, tzinfo=timezone.utc)
        rows = [
            (datetime(2026, 1, 1, tzinfo=timezone.utc), True),
            (datetime(2026, 1, 20, tzinfo=timezone.utc), True),
            (datetime(2026, 1, 21, tzinfo=timezone.utc), False),
            (datetime(2026, 1, 22, tzinfo=timezone.utc), False),
        ]
        total, flagged = _window_counts(rows, started_at)
        self.assertEqual(total, 3)
        self.assertEqual(flagged, 1)
        score = calculate_discipline_score(total_transactions=total, flagged_transactions=flagged)
        self.assertEqual(score, 67)

    def test_new_user_start_all_future_rows_count(self):
        started_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
        rows = [
            (datetime(2026, 4, 2, tzinfo=timezone.utc), False),
            (datetime(2026, 4, 3, tzinfo=timezone.utc), True),
        ]
        total, flagged = _window_counts(rows, started_at)
        self.assertEqual((total, flagged), (2, 1))

    def test_reset_moves_cutoff_old_activity_ignored(self):
        first_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        rows = [
            (datetime(2026, 2, 1, tzinfo=timezone.utc), True),
            (datetime(2026, 3, 1, tzinfo=timezone.utc), True),
        ]
        t0, f0 = _window_counts(rows, first_start)
        self.assertEqual((t0, f0), (2, 2))

        reset_at = datetime(2026, 6, 1, tzinfo=timezone.utc)
        t1, f1 = _window_counts(rows, reset_at)
        self.assertEqual((t1, f1), (0, 0))
        self.assertEqual(
            calculate_discipline_score(total_transactions=t1, flagged_transactions=f1),
            100,
        )

    def test_no_duplicate_count_per_transaction(self):
        started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        ts = datetime(2026, 2, 1, tzinfo=timezone.utc)
        rows = [
            (ts, False),
            (ts + timedelta(seconds=1), True),
        ]
        total, flagged = _window_counts(rows, started_at)
        self.assertEqual(total, 2)
        self.assertEqual(flagged, 1)
