import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.ports.classifier import ClassificationResult
from backend.services.classifier import classify_transaction


class ClassifierServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_classify_transaction_skips_ai_without_active_pacts(self):
        classifier = SimpleNamespace(
            classify_transaction=AsyncMock(
                return_value=ClassificationResult(
                    flagged=True,
                    category="gambling",
                    flag_reason="LLM: gambling merchant",
                )
            )
        )

        result = await classify_transaction(
            classifier,
            merchant="DraftKings",
            description="Weekly sports bet",
            amount=250.0,
            user_categories=[],
        )

        classifier.classify_transaction.assert_not_awaited()
        self.assertEqual(result, ClassificationResult(flagged=False))

    async def test_classify_transaction_matches_keywords_only_for_active_pacts(self):
        classifier = SimpleNamespace(classify_transaction=AsyncMock())

        result = await classify_transaction(
            classifier,
            merchant="DraftKings",
            description="Weekly sports bet",
            amount=250.0,
            user_categories=["gambling"],
        )

        classifier.classify_transaction.assert_not_awaited()
        self.assertTrue(result.flagged)
        self.assertEqual(result.category, "gambling")
        self.assertEqual(result.flag_reason, 'Matched your pact "gambling": keyword "draftkings"')

    async def test_classify_transaction_ignores_ai_categories_outside_active_pacts(self):
        classifier = SimpleNamespace(
            classify_transaction=AsyncMock(
                return_value=ClassificationResult(
                    flagged=True,
                    category="gambling",
                    flag_reason="LLM: gambling merchant",
                )
            )
        )

        result = await classify_transaction(
            classifier,
            merchant="DraftKings",
            description="Weekly sports bet",
            amount=250.0,
            user_categories=["coffee shops"],
        )

        classifier.classify_transaction.assert_awaited_once_with(
            merchant="DraftKings",
            description="Weekly sports bet",
            amount=250.0,
            user_categories=["coffee shops"],
        )
        self.assertEqual(result, ClassificationResult(flagged=False))
