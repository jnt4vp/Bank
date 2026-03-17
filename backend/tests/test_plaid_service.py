import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.plaid_service import seed_sandbox_plaid_item


class PlaidServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_seed_sandbox_plaid_item_skips_when_multiple_items_already_have_plaid_transactions(self):
        user_id = uuid4()
        newest_item = SimpleNamespace(id=uuid4())
        older_item = SimpleNamespace(id=uuid4())
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    SimpleNamespace(
                        scalars=lambda: SimpleNamespace(all=lambda: [newest_item, older_item])
                    ),
                    SimpleNamespace(scalar_one_or_none=lambda: uuid4()),
                ]
            )
        )

        with patch(
            "backend.services.plaid_service.get_settings",
            return_value=SimpleNamespace(
                PLAID_ENV="sandbox",
                PLAID_CLIENT_ID="client-id",
                PLAID_SECRET="secret",
            ),
        ):
            result = await seed_sandbox_plaid_item(db, user_id)

        self.assertIsNone(result)

    async def test_seed_sandbox_plaid_item_reuses_newest_item_when_multiple_items_exist_without_plaid_transactions(self):
        user_id = uuid4()
        newest_item = SimpleNamespace(id=uuid4())
        older_item = SimpleNamespace(id=uuid4())
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    SimpleNamespace(
                        scalars=lambda: SimpleNamespace(all=lambda: [newest_item, older_item])
                    ),
                    SimpleNamespace(scalar_one_or_none=lambda: None),
                ]
            )
        )

        with patch(
            "backend.services.plaid_service.get_settings",
            return_value=SimpleNamespace(
                PLAID_ENV="sandbox",
                PLAID_CLIENT_ID="client-id",
                PLAID_SECRET="secret",
            ),
        ):
            result = await seed_sandbox_plaid_item(db, user_id)

        self.assertIs(result, newest_item)
