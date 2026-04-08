import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.simulated_savings_transfers import (
    record_simulated_savings_transfers_for_transaction,
)


class SimulatedSavingsTransfersServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_record_skips_when_feature_disabled(self):
        txn = SimpleNamespace(id=uuid4(), flagged=True)
        db = SimpleNamespace(execute=AsyncMock(), flush=AsyncMock())

        with patch(
            "backend.services.simulated_savings_transfers.get_settings",
            return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=False),
        ):
            n = await record_simulated_savings_transfers_for_transaction(
                db,
                user_id=uuid4(),
                transaction=txn,
            )

        self.assertEqual(n, 0)
        db.execute.assert_not_awaited()

    async def test_record_skips_when_not_flagged(self):
        txn = SimpleNamespace(id=uuid4(), flagged=False)
        db = SimpleNamespace(execute=AsyncMock(), flush=AsyncMock())

        with patch(
            "backend.services.simulated_savings_transfers.get_settings",
            return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
        ):
            n = await record_simulated_savings_transfers_for_transaction(
                db,
                user_id=uuid4(),
                transaction=txn,
            )

        self.assertEqual(n, 0)
        db.execute.assert_not_awaited()

    async def test_record_skips_plaid_initial_backfill_when_requested(self):
        txn = SimpleNamespace(id=uuid4(), flagged=True)
        db = SimpleNamespace(execute=AsyncMock(), flush=AsyncMock())

        with patch(
            "backend.services.simulated_savings_transfers.get_settings",
            return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
        ):
            n = await record_simulated_savings_transfers_for_transaction(
                db,
                user_id=uuid4(),
                transaction=txn,
                skip_for_initial_plaid_backfill=True,
            )

        self.assertEqual(n, 0)
        db.execute.assert_not_awaited()
