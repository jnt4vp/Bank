import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.plaid_category_resolution import (
    category_from_plaid_transaction,
    infer_category_from_local_fields,
    resolved_plaid_category,
)


class PlaidCategoryResolutionTest(unittest.TestCase):
    def test_category_from_plaid_prefers_primary_then_detailed_then_legacy(self):
        txn = SimpleNamespace(
            personal_finance_category=SimpleNamespace(
                primary="FOOD_AND_DRINK", detailed="FOOD_AND_DRINK_FAST_FOOD"
            ),
            category=None,
        )
        self.assertEqual(category_from_plaid_transaction(txn), "FOOD_AND_DRINK")

        txn2 = SimpleNamespace(
            personal_finance_category=SimpleNamespace(
                primary="", detailed="TRANSPORTATION_TAXIS"
            ),
            category=None,
        )
        self.assertEqual(category_from_plaid_transaction(txn2), "TRANSPORTATION_TAXIS")

        txn3 = SimpleNamespace(personal_finance_category=None, category=["Shops"])
        self.assertEqual(category_from_plaid_transaction(txn3), "Shops")

    def test_resolved_plaid_category_falls_back_to_merchant_hints(self):
        txn = SimpleNamespace(personal_finance_category=None, category=None)
        self.assertEqual(
            resolved_plaid_category("Starbucks #1029", "Card purchase", txn),
            "FOOD_AND_DRINK",
        )

    def test_infer_category_from_local_fields_uses_original_description(self):
        self.assertEqual(
            infer_category_from_local_fields(
                "POS PURCHASE",
                "",
                "STARBUCKS STORE 1234",
            ),
            "FOOD_AND_DRINK",
        )
