import logging
from ..ports.classifier import ClassificationResult, ClassifierPort

logger = logging.getLogger("bank.classifier")

GAMBLING_KEYWORDS = [
    "draftkings", "fanduel", "betmgm", "bet365", "caesars sportsbook",
    "pokerstars", "bovada", "barstool", "wynn", "pointsbet",
    "roobet", "stake.com", "stake", "mybookie", "betonline",
    "casino", "poker", "sportsbook", "gambling", "wagering", "betting",
    "slot", "blackjack", "roulette",
]

ADULT_KEYWORDS = [
    "onlyfans", "adult", "xxx", "strip club", "escort",
    "adult entertainment", "gentlemen's club",
]

ALCOHOL_KEYWORDS = [
    "liquor", "liquor store", "wine shop", "beer store", "spirits",
    "total wine", "abc store", "bevmo", "spec's", "binny's",
    "bar tab", "pub", "brewery", "distillery", "tavern",
]

DRUG_KEYWORDS = [
    "dispensary", "cannabis", "marijuana", "weed", "smoke shop",
    "head shop", "paraphernalia", "vape shop",
]

# Keywords for preset pact categories users can choose during signup
PACT_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "dining out": [
        "restaurant", "dining", "dine", "eatery", "bistro", "grill",
        "steakhouse", "sushi", "pizzeria", "trattoria", "brasserie",
        "applebee", "chili's", "olive garden", "outback", "red lobster",
        "cheesecake factory", "ihop", "denny's", "cracker barrel",
    ],
    "coffee shops": [
        "starbucks", "dunkin", "coffee", "cafe", "café", "peet's",
        "dutch bros", "caribou coffee", "tim hortons", "philz",
        "blue bottle", "espresso", "latte", "brew",
    ],
    "online shopping": [
        "amazon", "ebay", "shopify", "etsy", "walmart.com", "target.com",
        "wish.com", "aliexpress", "shein", "temu", "wayfair",
        "online purchase", "e-commerce",
    ],
    "entertainment": [
        "netflix", "hulu", "spotify", "disney+", "hbo", "paramount",
        "peacock", "apple tv", "youtube premium", "cinema", "theater",
        "theatre", "movie", "concert", "ticketmaster", "stubhub",
        "amc", "regal", "imax", "arcade", "bowling",
    ],
    "ride share": [
        "uber", "lyft", "ride share", "rideshare", "via",
        "uber trip", "lyft ride",
    ],
    "fast food": [
        "mcdonald", "burger king", "wendy", "taco bell", "chick-fil-a",
        "popeyes", "subway", "kfc", "arby's", "sonic", "jack in the box",
        "five guys", "in-n-out", "whataburger", "panda express",
        "chipotle", "domino", "pizza hut", "papa john",
        "fast food", "drive thru", "drive-thru",
    ],
    "convenience store": [
        "7-eleven", "7eleven", "wawa", "sheetz", "circle k",
        "quicktrip", "qt", "casey's", "pilot", "love's",
        "convenience", "kwik", "am pm", "ampm",
    ],
    "non-essential spending": [],  # too broad for keyword matching — handled by LLM
}
def _match_keywords(text: str, keywords: list[str]) -> str | None:
    text_lower = text.lower()
    for kw in keywords:
        if kw in text_lower:
            return kw
    return None


def _rule_based_classify(merchant: str, description: str, amount: float) -> ClassificationResult | None:
    combined = f"{merchant} {description}"

    match = _match_keywords(combined, GAMBLING_KEYWORDS)
    if match:
        return ClassificationResult(
            flagged=True,
            category="gambling",
            flag_reason=f"Matched gambling keyword: {match}",
        )

    match = _match_keywords(combined, ADULT_KEYWORDS)
    if match:
        return ClassificationResult(
            flagged=True,
            category="adult",
            flag_reason=f"Matched adult content keyword: {match}",
        )

    match = _match_keywords(combined, ALCOHOL_KEYWORDS)
    if match:
        return ClassificationResult(
            flagged=True,
            category="alcohol",
            flag_reason=f"Matched alcohol keyword: {match}",
        )

    match = _match_keywords(combined, DRUG_KEYWORDS)
    if match:
        return ClassificationResult(
            flagged=True,
            category="drugs",
            flag_reason=f"Matched drug keyword: {match}",
        )

    return None


def _match_user_pacts(
    merchant: str, description: str, user_categories: list[str],
) -> ClassificationResult | None:
    """Check if a transaction matches any of the user's active pact categories."""
    combined = f"{merchant} {description}".lower()

    for cat in user_categories:
        cat_lower = cat.lower()

        # Try preset keyword list first
        keywords = PACT_CATEGORY_KEYWORDS.get(cat_lower, [])
        if keywords:
            match = _match_keywords(combined, keywords)
            if match:
                return ClassificationResult(
                    flagged=True,
                    category=cat_lower,
                    flag_reason=f"Matched your pact \"{cat}\": keyword \"{match}\"",
                )
        else:
            # Custom category — substring match against merchant/description
            if cat_lower in combined:
                return ClassificationResult(
                    flagged=True,
                    category=cat_lower,
                    flag_reason=f"Matched your pact \"{cat}\"",
                )

    return None


async def classify_transaction(
    classifier: ClassifierPort,
    *,
    merchant: str,
    description: str,
    amount: float,
    user_categories: list[str] | None = None,
) -> ClassificationResult:
    # 1. Hardcoded rule-based flags (always-flag categories)
    rule_result = _rule_based_classify(merchant, description, amount)
    if rule_result is not None:
        logger.info(
            "Rule-based flag: %s | %s | $%.2f → %s (%s)",
            merchant, description, amount, rule_result.category, rule_result.flag_reason,
        )
        return rule_result

    # 2. User pact category matching
    if user_categories:
        pact_result = _match_user_pacts(merchant, description, user_categories)
        if pact_result is not None:
            logger.info(
                "Pact-based flag: %s | %s | $%.2f → %s (%s)",
                merchant, description, amount, pact_result.category, pact_result.flag_reason,
            )
            return pact_result

    # 3. LLM classification (also pact-aware)
    llm_result = await classifier.classify_transaction(
        merchant=merchant,
        description=description,
        amount=amount,
        user_categories=user_categories,
    )
    if llm_result is not None:
        logger.info(
            "LLM classification: %s | %s | $%.2f → flagged=%s category=%s",
            merchant, description, amount, llm_result.flagged, llm_result.category,
        )
        return llm_result

    return ClassificationResult(flagged=False)
