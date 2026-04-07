"""Discipline baseline opens only after bank link + first empty-ledger sync."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from backend.services.discipline import (
    count_transactions_for_discipline_score,
    ensure_discipline_window_after_plaid_sync,
)


class EnsureDisciplineAfterPlaidTest(unittest.IsolatedAsyncioTestCase):
    async def test_skips_when_no_bank_connected_timestamp(self):
        uid = uuid4()
        user = SimpleNamespace(
            discipline_score_started_at=None,
            bank_connected_at=None,
        )
        r1 = MagicMock()
        r1.scalar_one_or_none.return_value = user
        session = AsyncMock()
        session.execute = AsyncMock(return_value=r1)

        await ensure_discipline_window_after_plaid_sync(session, uid, prior_txn_count=0)

        self.assertIsNone(user.discipline_score_started_at)
        self.assertEqual(session.execute.await_count, 1)

    async def test_skips_second_bank_when_prior_txns_exist(self):
        uid = uuid4()
        user = SimpleNamespace(
            discipline_score_started_at=None,
            bank_connected_at=datetime.now(timezone.utc),
        )
        r1 = MagicMock()
        r1.scalar_one_or_none.return_value = user
        session = AsyncMock()
        session.execute = AsyncMock(return_value=r1)

        await ensure_discipline_window_after_plaid_sync(session, uid, prior_txn_count=4)

        self.assertIsNone(user.discipline_score_started_at)
        self.assertEqual(session.execute.await_count, 1)

    async def test_sets_cutoff_when_bank_linked_and_ledger_was_empty(self):
        uid = uuid4()
        user = SimpleNamespace(
            discipline_score_started_at=None,
            bank_connected_at=datetime.now(timezone.utc),
        )
        r1 = MagicMock()
        r1.scalar_one_or_none.return_value = user
        r2 = MagicMock()
        r2.scalar_one.return_value = None
        session = AsyncMock()
        session.execute = AsyncMock(side_effect=[r1, r2])

        await ensure_discipline_window_after_plaid_sync(session, uid, prior_txn_count=0)

        self.assertIsNotNone(user.discipline_score_started_at)
        self.assertEqual(session.execute.await_count, 2)


class CountHistoricalExclusionTest(unittest.IsolatedAsyncioTestCase):
    async def test_in_window_totals_from_execute(self):
        uid = uuid4()
        cutoff = datetime(2026, 6, 15, tzinfo=timezone.utc)
        r_total = MagicMock()
        r_total.scalar_one.return_value = 2
        r_flag = MagicMock()
        r_flag.scalar_one.return_value = 1
        session = AsyncMock()
        session.execute = AsyncMock(side_effect=[r_total, r_flag])

        total, flagged = await count_transactions_for_discipline_score(
            session,
            user_id=uid,
            discipline_score_started_at=cutoff,
        )
        self.assertEqual((total, flagged), (2, 1))
        self.assertEqual(session.execute.await_count, 2)
