"""Tests for goal attribution compute_goal_spending and goals route."""

import os
import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.services.goal_attribution import (
    GoalSpec,
    _goal_spend_contribution,
    _in_calendar_period,
    _in_discipline_window,
    _resolve_gkey_from_llm_label,
    _transaction_effective_date,
    build_goal_specs,
    compute_goal_spending,
    map_broad_to_goal_key,
)
from backend.schemas.goals import GoalAttributionSpec


class BuildGoalSpecsTest(unittest.TestCase):
    def test_builds_specs_from_attribution_specs(self):
        goals = [
            GoalAttributionSpec(category="Coffee", keywords=["starbucks"], merchants=["dunkin"], subcategories=["cafe"]),
            GoalAttributionSpec(category="  Shopping  "),
        ]
        specs = build_goal_specs(goals)
        self.assertEqual(len(specs), 2)
        self.assertEqual(specs[0].key, "coffee")
        self.assertEqual(specs[0].keywords, ("starbucks",))
        self.assertEqual(specs[0].merchants, ("dunkin",))
        self.assertEqual(specs[1].key, "shopping")


class GoalSpendContributionTest(unittest.TestCase):
    def test_positive_amount_counted(self):
        txn = SimpleNamespace(amount=25.0)
        self.assertEqual(_goal_spend_contribution(txn), 25.0)

    def test_negative_amount_ignored(self):
        txn = SimpleNamespace(amount=-10.0)
        self.assertEqual(_goal_spend_contribution(txn), 0.0)

    def test_zero_amount(self):
        txn = SimpleNamespace(amount=0)
        self.assertEqual(_goal_spend_contribution(txn), 0.0)

    def test_none_amount(self):
        txn = SimpleNamespace(amount=None)
        self.assertEqual(_goal_spend_contribution(txn), 0.0)


class TransactionEffectiveDateTest(unittest.TestCase):
    def test_uses_date_field_when_present(self):
        txn = SimpleNamespace(date=date(2024, 6, 15), created_at=datetime(2024, 6, 16, tzinfo=timezone.utc))
        self.assertEqual(_transaction_effective_date(txn), date(2024, 6, 15))

    def test_falls_back_to_created_at(self):
        txn = SimpleNamespace(date=None, created_at=datetime(2024, 6, 16, 14, 0, tzinfo=timezone.utc))
        self.assertEqual(_transaction_effective_date(txn), date(2024, 6, 16))

    def test_naive_created_at_treated_as_utc(self):
        txn = SimpleNamespace(date=None, created_at=datetime(2024, 6, 16, 14, 0))
        self.assertEqual(_transaction_effective_date(txn), date(2024, 6, 16))


class InDisciplineWindowTest(unittest.TestCase):
    def test_returns_false_when_no_start(self):
        txn = SimpleNamespace(created_at=datetime.now(timezone.utc))
        user = SimpleNamespace(discipline_score_started_at=None)
        self.assertFalse(_in_discipline_window(txn, user))

    def test_returns_true_when_after_start(self):
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        txn = SimpleNamespace(created_at=datetime(2024, 6, 1, tzinfo=timezone.utc))
        user = SimpleNamespace(discipline_score_started_at=start)
        self.assertTrue(_in_discipline_window(txn, user))

    def test_returns_false_when_before_start(self):
        start = datetime(2024, 6, 1, tzinfo=timezone.utc)
        txn = SimpleNamespace(created_at=datetime(2024, 1, 1, tzinfo=timezone.utc))
        user = SimpleNamespace(discipline_score_started_at=start)
        self.assertFalse(_in_discipline_window(txn, user))


class InCalendarPeriodTest(unittest.TestCase):
    def test_in_range(self):
        txn = SimpleNamespace(date=date(2024, 6, 15), created_at=datetime(2024, 6, 15, tzinfo=timezone.utc))
        self.assertTrue(_in_calendar_period(txn, date(2024, 6, 1), date(2024, 6, 30)))

    def test_out_of_range(self):
        txn = SimpleNamespace(date=date(2024, 7, 1), created_at=datetime(2024, 7, 1, tzinfo=timezone.utc))
        self.assertFalse(_in_calendar_period(txn, date(2024, 6, 1), date(2024, 6, 30)))


class MapBroadToGoalKeyTest(unittest.TestCase):
    def test_matches_subcategory(self):
        specs = [
            GoalSpec(key="food", display="Food", keywords=(), merchants=(), subcategories=("restaurant", "dining")),
            GoalSpec(key="shopping", display="Shopping", keywords=(), merchants=(), subcategories=("retail",)),
        ]
        self.assertEqual(map_broad_to_goal_key("restaurant", specs), "food")
        self.assertEqual(map_broad_to_goal_key("retail", specs), "shopping")
        self.assertIsNone(map_broad_to_goal_key("travel", specs))

    def test_empty_broad_returns_none(self):
        specs = [GoalSpec(key="x", display="X", keywords=(), merchants=(), subcategories=("y",))]
        self.assertIsNone(map_broad_to_goal_key("", specs))


class ResolveLlmLabelTest(unittest.TestCase):
    def test_exact_match(self):
        specs = [
            GoalSpec(key="coffee", display="Coffee", keywords=(), merchants=(), subcategories=()),
        ]
        self.assertEqual(_resolve_gkey_from_llm_label("Coffee", specs), "coffee")

    def test_quoted_label(self):
        specs = [
            GoalSpec(key="coffee", display="Coffee", keywords=(), merchants=(), subcategories=()),
        ]
        self.assertEqual(_resolve_gkey_from_llm_label('"Coffee"', specs), "coffee")

    def test_null_returns_none(self):
        self.assertIsNone(_resolve_gkey_from_llm_label(None, []))

    def test_prefix_match_single(self):
        specs = [
            GoalSpec(key="dining out", display="Dining Out", keywords=(), merchants=(), subcategories=()),
        ]
        self.assertEqual(_resolve_gkey_from_llm_label("Dining Out - expensive", specs), "dining out")


class ComputeGoalSpendingRulesOnlyTest(unittest.IsolatedAsyncioTestCase):
    async def test_rules_only_with_matching_transactions(self):
        user_id = uuid4()
        user = SimpleNamespace(
            id=user_id,
            discipline_score_started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
        txn = SimpleNamespace(
            id=uuid4(), merchant="Starbucks", description="Latte",
            amount=5.50, category="Coffee Shops",
            plaid_original_description=None,
            date=date(2024, 6, 15),
            created_at=datetime(2024, 6, 15, tzinfo=timezone.utc),
        )
        settings = SimpleNamespace(OLLAMA_ENABLED=False)
        goals = [GoalAttributionSpec(category="Coffee")]

        with patch(
            "backend.services.goal_attribution.get_transactions_for_user",
            new=AsyncMock(return_value=[txn]),
        ):
            spent, method, llm_n = await compute_goal_spending(
                AsyncMock(), user,
                goals=goals,
                period_start=date(2024, 6, 1),
                period_end=date(2024, 6, 30),
                settings=settings,
            )

        self.assertEqual(method, "rules")
        self.assertEqual(llm_n, 0)
        self.assertAlmostEqual(spent["coffee"], 5.50)

    async def test_empty_goals_returns_empty(self):
        user = SimpleNamespace(id=uuid4(), discipline_score_started_at=datetime.now(timezone.utc))
        settings = SimpleNamespace(OLLAMA_ENABLED=False)
        spent, method, llm_n = await compute_goal_spending(
            AsyncMock(), user,
            goals=[], period_start=date(2024, 1, 1), period_end=date(2024, 12, 31),
            settings=settings,
        )
        self.assertEqual(spent, {})
        self.assertEqual(method, "rules")


class GoalsRouteTest(unittest.IsolatedAsyncioTestCase):
    async def test_spending_breakdown_calls_service(self):
        from backend.routers.goals import goal_spending_breakdown
        from backend.schemas.goals import GoalSpendingRequest

        user = SimpleNamespace(id=uuid4())
        payload = GoalSpendingRequest(
            goals=[GoalAttributionSpec(category="Coffee")],
            period_start=date(2024, 6, 1),
            period_end=date(2024, 6, 30),
        )

        with (
            patch("backend.routers.goals.get_settings", return_value=SimpleNamespace(OLLAMA_ENABLED=False)),
            patch(
                "backend.routers.goals.compute_goal_spending",
                new=AsyncMock(return_value=({"coffee": 25.0}, "rules", 0)),
            ) as compute_mock,
        ):
            resp = await goal_spending_breakdown(payload, db=AsyncMock(), current_user=user)

        compute_mock.assert_awaited_once()
        self.assertEqual(resp.spent_by_goal, {"coffee": 25.0})
        self.assertEqual(resp.method, "rules")


if __name__ == "__main__":
    unittest.main()
