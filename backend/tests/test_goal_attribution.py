import unittest

from backend.services.goal_attribution import (
    GoalSpec,
    map_broad_to_goal_key,
    rule_match_transaction_to_goal,
    rule_match_transaction_to_specs,
)


class RuleMatchTransactionToGoalTests(unittest.TestCase):
    def test_preset_fast_food_keyword(self):
        g = rule_match_transaction_to_goal(
            "McDonald's #1234",
            "POS purchase",
            None,
            "Food and Drink",
            ["fast food", "coffee shops"],
        )
        self.assertEqual(g, "fast food")

    def test_custom_label_substring_in_merchant(self):
        g = rule_match_transaction_to_goal(
            "Sephora Downtown",
            "purchase",
            None,
            "GENERAL_MERCHANDISE",
            ["beauty", "shopping"],
        )
        self.assertEqual(g, "beauty")

    def test_custom_label_overlaps_bank_category(self):
        g = rule_match_transaction_to_goal(
            "AMZN MKTP",
            "order",
            None,
            "shopping online",
            ["fun", "shopping"],
        )
        self.assertEqual(g, "shopping")

    def test_hint_tokens_for_user_fun_goal(self):
        g = rule_match_transaction_to_goal(
            "Party City",
            "supplies",
            None,
            None,
            ["fun"],
        )
        self.assertEqual(g, "fun")

    def test_multiword_goal_all_tokens_must_match(self):
        g = rule_match_transaction_to_goal(
            "Whole Foods",
            "groceries",
            None,
            None,
            ["ice cream", "luxury yachts"],
        )
        self.assertIsNone(g)

    def test_goal_order_first_wins(self):
        g = rule_match_transaction_to_goal(
            "Starbucks",
            "coffee",
            None,
            None,
            ["fast food", "coffee shops"],
        )
        self.assertEqual(g, "coffee shops")

    def test_user_keywords_on_abstract_goal(self):
        specs = [
            GoalSpec(
                key="fun",
                display="Fun",
                keywords=("ticketmaster", "concert"),
                merchants=tuple(),
                subcategories=tuple(),
            )
        ]
        g = rule_match_transaction_to_specs(
            "TICKETMASTER",
            "taylor swift tickets",
            None,
            None,
            specs,
        )
        self.assertEqual(g, "fun")

    def test_user_subcategory_token_in_bank_category(self):
        specs = [
            GoalSpec(
                key="fun",
                display="Fun",
                keywords=tuple(),
                merchants=tuple(),
                subcategories=("entertainment", "gaming"),
            )
        ]
        g = rule_match_transaction_to_specs(
            "AMC",
            "movie",
            None,
            "ENTERTAINMENT_RECREATION",
            specs,
        )
        self.assertEqual(g, "fun")

    def test_user_merchant_substring(self):
        specs = [
            GoalSpec(
                key="coffee",
                display="Coffee",
                keywords=tuple(),
                merchants=("starbucks",),
                subcategories=tuple(),
            )
        ]
        g = rule_match_transaction_to_specs(
            "STARBUCKS STORE 1928",
            "purchase",
            None,
            None,
            specs,
        )
        self.assertEqual(g, "coffee")

    def test_coffee_goal_name_matches_starbucks_via_preset_alias(self):
        """Goal named 'Coffee' uses coffee-shops keyword list (includes starbucks)."""
        specs = [
            GoalSpec(
                key="coffee",
                display="Coffee",
                keywords=tuple(),
                merchants=tuple(),
                subcategories=tuple(),
            )
        ]
        g = rule_match_transaction_to_specs(
            "STARBUCKS STORE 4921",
            "Card purchase",
            None,
            "FOOD_AND_DRINK",
            specs,
        )
        self.assertEqual(g, "coffee")

    def test_map_broad_label_to_goal_via_subcategories(self):
        specs = [
            GoalSpec(
                key="fun",
                display="Fun",
                keywords=tuple(),
                merchants=tuple(),
                subcategories=("entertainment", "shopping", "gaming"),
            )
        ]
        self.assertEqual(map_broad_to_goal_key("entertainment", specs), "fun")
        self.assertEqual(map_broad_to_goal_key("gaming", specs), "fun")
        self.assertIsNone(map_broad_to_goal_key("groceries", specs))


if __name__ == "__main__":
    unittest.main()
