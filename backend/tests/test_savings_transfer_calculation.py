"""Tests for actual savings transfer calculation, listing, and backfill."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.simulated_savings_transfers import (
    _round_currency,
    _savings_base_amount,
    _transaction_matches_pact,
    backfill_simulated_savings_for_user,
    list_simulated_transfers_for_user,
    record_simulated_savings_transfers_for_transaction,
)


class RoundCurrencyTest(unittest.TestCase):
    def test_rounds_to_two_decimals(self):
        self.assertEqual(_round_currency(10.555), 10.56)
        self.assertEqual(_round_currency(10.554), 10.55)
        self.assertEqual(_round_currency(0.001), 0.0)

    def test_round_half_up(self):
        self.assertEqual(_round_currency(1.005), 1.01)  # ROUND_HALF_UP


class SavingsBaseAmountTest(unittest.TestCase):
    def test_positive_amount(self):
        txn = SimpleNamespace(amount=50.0)
        self.assertEqual(_savings_base_amount(txn), 50.0)

    def test_negative_amount_uses_abs(self):
        txn = SimpleNamespace(amount=-30.0)
        self.assertEqual(_savings_base_amount(txn), 30.0)


class TransactionMatchesPactTest(unittest.TestCase):
    def test_category_match(self):
        txn = SimpleNamespace(category="Coffee Shops", merchant="Starbucks", description="Latte")
        pact = SimpleNamespace(custom_category=None, category="coffee shops", preset_category="Coffee Shops")
        self.assertTrue(_transaction_matches_pact(txn, pact))

    def test_merchant_match(self):
        txn = SimpleNamespace(category="Other", merchant="Starbucks Coffee", description="")
        pact = SimpleNamespace(custom_category="starbucks", category="starbucks", preset_category=None)
        self.assertTrue(_transaction_matches_pact(txn, pact))

    def test_no_match(self):
        txn = SimpleNamespace(category="Utilities", merchant="ConEd", description="Electric bill")
        pact = SimpleNamespace(custom_category=None, category="Coffee Shops", preset_category="Coffee Shops")
        self.assertFalse(_transaction_matches_pact(txn, pact))

    def test_empty_pact_category(self):
        txn = SimpleNamespace(category="Anything", merchant="Any", description="Any")
        pact = SimpleNamespace(custom_category=None, category=None, preset_category=None)
        self.assertFalse(_transaction_matches_pact(txn, pact))


class RecordSimulatedSavingsTest(unittest.IsolatedAsyncioTestCase):
    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
    )
    async def test_creates_transfer_for_matching_flagged_transaction(self, _settings):
        user_id = uuid4()
        txn_id = uuid4()
        pact_id = uuid4()

        txn = SimpleNamespace(
            id=txn_id, amount=100.0, flagged=True,
            category="Coffee Shops", merchant="Starbucks", description="Latte",
        )

        # Pact with accountability_settings having 10% savings
        acc = SimpleNamespace(discipline_savings_percentage=10.0)
        pact = SimpleNamespace(
            id=pact_id, user_id=user_id,
            custom_category=None, category="coffee shops", preset_category="Coffee Shops",
            status="active", accountability_settings=acc,
        )

        # Mock DB: pact query + dup check
        class _ScalarUnique:
            def unique(self):
                return self
            def all(self):
                return [pact]

        class _PactResult:
            def scalars(self):
                return _ScalarUnique()

        # Dup check returns None (no existing transfer)
        dup_result = MagicMock()
        dup_result.scalar_one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_PactResult(), dup_result])

        count = await record_simulated_savings_transfers_for_transaction(
            db, user_id=user_id, transaction=txn,
        )

        self.assertEqual(count, 1)
        db.add.assert_called_once()
        added = db.add.call_args[0][0]
        self.assertEqual(float(added.amount), 10.0)  # 10% of 100

    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
    )
    async def test_skips_when_not_flagged(self, _settings):
        txn = SimpleNamespace(id=uuid4(), amount=50.0, flagged=False)
        count = await record_simulated_savings_transfers_for_transaction(
            AsyncMock(), user_id=uuid4(), transaction=txn,
        )
        self.assertEqual(count, 0)

    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
    )
    async def test_skips_duplicate_transfer(self, _settings):
        user_id = uuid4()
        txn_id = uuid4()
        pact_id = uuid4()

        txn = SimpleNamespace(
            id=txn_id, amount=100.0, flagged=True,
            category="Coffee", merchant="Starbucks", description="",
        )
        acc = SimpleNamespace(discipline_savings_percentage=10.0)
        pact = SimpleNamespace(
            id=pact_id, user_id=user_id,
            custom_category=None, category="coffee", preset_category="Coffee",
            status="active", accountability_settings=acc,
        )

        class _ScalarUnique:
            def unique(self):
                return self
            def all(self):
                return [pact]

        class _PactResult:
            def scalars(self):
                return _ScalarUnique()

        # Dup check returns existing row
        dup_result = MagicMock()
        dup_result.scalar_one_or_none.return_value = uuid4()

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_PactResult(), dup_result])

        count = await record_simulated_savings_transfers_for_transaction(
            db, user_id=user_id, transaction=txn,
        )
        self.assertEqual(count, 0)
        db.add.assert_not_called()

    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
    )
    async def test_skips_zero_percentage(self, _settings):
        user_id = uuid4()
        txn = SimpleNamespace(
            id=uuid4(), amount=100.0, flagged=True,
            category="Coffee", merchant="Starbucks", description="",
        )
        acc = SimpleNamespace(discipline_savings_percentage=0)
        pact = SimpleNamespace(
            id=uuid4(), user_id=user_id,
            custom_category=None, category="coffee", preset_category="Coffee",
            status="active", accountability_settings=acc,
        )

        class _ScalarUnique:
            def unique(self):
                return self
            def all(self):
                return [pact]

        class _PactResult:
            def scalars(self):
                return _ScalarUnique()

        db = AsyncMock()
        db.execute = AsyncMock(return_value=_PactResult())

        count = await record_simulated_savings_transfers_for_transaction(
            db, user_id=user_id, transaction=txn,
        )
        self.assertEqual(count, 0)

    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
    )
    async def test_correct_percentage_calculation(self, _settings):
        """Test that 15% of $80 = $12.00"""
        user_id = uuid4()
        txn = SimpleNamespace(
            id=uuid4(), amount=80.0, flagged=True,
            category="dining", merchant="Restaurant", description="Dinner",
        )
        acc = SimpleNamespace(discipline_savings_percentage=15.0)
        pact = SimpleNamespace(
            id=uuid4(), user_id=user_id,
            custom_category="dining", category="dining", preset_category=None,
            status="active", accountability_settings=acc,
        )

        class _ScalarUnique:
            def unique(self):
                return self
            def all(self):
                return [pact]

        class _PactResult:
            def scalars(self):
                return _ScalarUnique()

        dup_result = MagicMock()
        dup_result.scalar_one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_PactResult(), dup_result])

        count = await record_simulated_savings_transfers_for_transaction(
            db, user_id=user_id, transaction=txn,
        )
        self.assertEqual(count, 1)
        added = db.add.call_args[0][0]
        self.assertEqual(float(added.amount), 12.0)


class ListSimulatedTransfersTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_list(self):
        transfers = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]
        scalars = MagicMock()
        scalars.all.return_value = transfers
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars
        db = AsyncMock()
        db.execute = AsyncMock(return_value=exec_result)

        result = await list_simulated_transfers_for_user(db, uuid4())
        self.assertEqual(len(result), 2)


class BackfillSimulatedSavingsTest(unittest.IsolatedAsyncioTestCase):
    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=True),
    )
    async def test_processes_all_flagged_transactions(self, _settings):
        txn1 = SimpleNamespace(id=uuid4(), flagged=True, amount=50.0)
        txn2 = SimpleNamespace(id=uuid4(), flagged=True, amount=30.0)

        scalars = MagicMock()
        scalars.all.return_value = [txn1, txn2]
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars
        db = AsyncMock()
        db.execute = AsyncMock(return_value=exec_result)

        with patch(
            "backend.services.simulated_savings_transfers.record_simulated_savings_transfers_for_transaction",
            new=AsyncMock(return_value=1),
        ) as record_mock:
            total = await backfill_simulated_savings_for_user(db, user_id=uuid4())

        self.assertEqual(record_mock.await_count, 2)
        self.assertEqual(total, 2)

    @patch(
        "backend.services.simulated_savings_transfers.get_settings",
        return_value=SimpleNamespace(SIMULATED_TRANSFERS_ENABLED=False),
    )
    async def test_returns_zero_when_disabled(self, _settings):
        total = await backfill_simulated_savings_for_user(AsyncMock(), user_id=uuid4())
        self.assertEqual(total, 0)


if __name__ == "__main__":
    unittest.main()
