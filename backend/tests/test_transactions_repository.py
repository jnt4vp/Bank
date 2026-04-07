import unittest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from backend.repositories.transactions import get_transactions_for_user


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


if __name__ == "__main__":
    unittest.main()
