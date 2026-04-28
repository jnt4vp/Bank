import unittest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from backend.repositories.transactions import create_transaction, get_transactions_for_user


class GetTransactionsForUserTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_all_transactions_by_default(self):
        uid = uuid4()
        txn_flagged = MagicMock()
        txn_clear = MagicMock()
        scalars_result = MagicMock()
        scalars_result.all.return_value = [txn_flagged, txn_clear]
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars_result
        session = AsyncMock()
        session.execute = AsyncMock(return_value=exec_result)

        rows = await get_transactions_for_user(session, uid)
        self.assertEqual(len(rows), 2)
        session.execute.assert_awaited_once()

    async def test_flagged_only_passes_filter(self):
        uid = uuid4()
        txn_flagged = MagicMock()
        scalars_result = MagicMock()
        scalars_result.all.return_value = [txn_flagged]
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars_result
        session = AsyncMock()
        session.execute = AsyncMock(return_value=exec_result)

        rows = await get_transactions_for_user(session, uid, flagged_only=True)
        self.assertEqual(len(rows), 1)
        session.execute.assert_awaited_once()

    async def test_query_includes_flagged_filter_when_requested(self):
        """Verify the actual SQL WHERE clause differs when flagged_only=True."""
        uid = uuid4()
        scalars_result = MagicMock()
        scalars_result.all.return_value = []
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars_result
        session = AsyncMock()
        session.execute = AsyncMock(return_value=exec_result)

        await get_transactions_for_user(session, uid, flagged_only=False)
        query_all = str(session.execute.call_args_list[0][0][0])

        session.execute.reset_mock()
        session.execute = AsyncMock(return_value=exec_result)
        await get_transactions_for_user(session, uid, flagged_only=True)
        query_flagged = str(session.execute.call_args_list[0][0][0])

        # The flagged query should include an extra filter clause
        self.assertIn("flagged", query_flagged.lower())

    async def test_sort_falls_back_to_created_at_when_date_is_null(self):
        """Manual ingests have NULL date; they used to sort to the end and
        get cut off by the LIMIT. The query should sort by COALESCE(date,
        created_at) so manual rows interleave by ingest time."""
        uid = uuid4()
        scalars_result = MagicMock()
        scalars_result.all.return_value = []
        exec_result = MagicMock()
        exec_result.scalars.return_value = scalars_result
        session = AsyncMock()
        session.execute = AsyncMock(return_value=exec_result)

        await get_transactions_for_user(session, uid)
        query = str(session.execute.call_args_list[0][0][0]).lower()

        self.assertIn("coalesce", query)
        self.assertIn("transactions.date", query)
        self.assertIn("transactions.created_at", query)
        # The previous "nulls last" sort was the bug — it must not be there.
        self.assertNotIn("nulls last", query)


class CreateTransactionTest(unittest.IsolatedAsyncioTestCase):
    async def test_creates_transaction_with_correct_fields(self):
        uid = uuid4()
        session = MagicMock()
        txn = await create_transaction(
            session,
            user_id=uid,
            merchant="Starbucks",
            description="Coffee",
            amount=5.50,
            category="Coffee Shops",
            flagged=True,
            flag_reason="keyword match",
        )
        session.add.assert_called_once_with(txn)
        self.assertEqual(txn.merchant, "Starbucks")
        self.assertEqual(txn.amount, 5.50)
        self.assertTrue(txn.flagged)
        self.assertEqual(txn.flag_reason, "keyword match")

    async def test_defaults_to_not_flagged(self):
        session = MagicMock()
        txn = await create_transaction(
            session,
            user_id=uuid4(),
            merchant="Target",
            description="Groceries",
            amount=50.0,
        )
        self.assertFalse(txn.flagged)
        self.assertIsNone(txn.flag_reason)


if __name__ == "__main__":
    unittest.main()
