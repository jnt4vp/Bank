import logging
from ..ports.classifier import ClassificationResult, ClassifierPort

logger = logging.getLogger("bank.classifier")

PACT_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "gambling": [
        "draftkings", "fanduel", "betmgm", "bet365", "caesars sportsbook",
        "pokerstars", "bovada", "barstool", "wynn", "pointsbet",
        "roobet", "stake.com", "stake", "mybookie", "betonline",
        "casino", "poker", "sportsbook", "gambling", "wagering", "betting",
        "slot", "blackjack", "roulette",
    ],
    "adult": [
        "onlyfans", "adult", "xxx", "strip club", "escort",
        "adult entertainment", "gentlemen's club",
    ],
    "alcohol": [
        "liquor", "liquor store", "wine shop", "beer store", "spirits",
        "total wine", "abc store", "bevmo", "spec's", "binny's",
        "bar tab", "pub", "brewery", "distillery", "tavern",
    ],
    "drugs": [
        "dispensary", "cannabis", "marijuana", "weed", "smoke shop",
        "head shop", "paraphernalia", "vape shop",
    ],
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


def _normalize_user_categories(user_categories: list[str] | None) -> tuple[list[str], dict[str, str]]:
    normalized: list[str] = []
    display_names: dict[str, str] = {}

    for category in user_categories or []:
        if not category:
            continue
        stripped = category.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered in display_names:
            continue
        normalized.append(lowered)
        display_names[lowered] = stripped

    return normalized, display_names


def _match_user_pacts(
    merchant: str,
    description: str,
    user_categories: list[str],
    display_names: dict[str, str],
) -> ClassificationResult | None:
    """Check if a transaction matches any of the user's active pact categories."""
    combined = f"{merchant} {description}".lower()

    for cat in user_categories:
        # Try preset keyword list first
        keywords = PACT_CATEGORY_KEYWORDS.get(cat, [])
        if keywords:
            match = _match_keywords(combined, keywords)
            if match:
                return ClassificationResult(
                    flagged=True,
                    category=cat,
                    flag_reason=f"Matched your pact \"{display_names[cat]}\": keyword \"{match}\"",
                )
        else:
            # Custom category — substring match against merchant/description
            if cat in combined:
                return ClassificationResult(
                    flagged=True,
                    category=cat,
                    flag_reason=f"Matched your pact \"{display_names[cat]}\"",
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
    normalized_categories, display_names = _normalize_user_categories(user_categories)
    if not normalized_categories:
        return ClassificationResult(flagged=False)

    pact_result = _match_user_pacts(
        merchant,
        description,
        normalized_categories,
        display_names,
    )
    if pact_result is not None:
        logger.info(
            "Pact-based flag: %s | %s | $%.2f → %s (%s)",
            merchant, description, amount, pact_result.category, pact_result.flag_reason,
        )
        return pact_result

    llm_result = await classifier.classify_transaction(
        merchant=merchant,
        description=description,
        amount=amount,
        user_categories=normalized_categories,
    )
    if llm_result is not None:
        normalized_category = (
            llm_result.category.strip().lower()
            if llm_result.category and llm_result.category.strip()
            else None
        )
        if llm_result.flagged and (
            normalized_category is None or normalized_category not in normalized_categories
        ):
            logger.warning(
                "Ignoring LLM classification outside active pacts: %s",
                llm_result.category,
            )
            return ClassificationResult(flagged=False)
        logger.info(
            "LLM classification: %s | %s | $%.2f → flagged=%s category=%s",
            merchant, description, amount, llm_result.flagged, normalized_category,
        )
        if not llm_result.flagged:
            return ClassificationResult(flagged=False)
        return ClassificationResult(
            flagged=True,
            category=normalized_category,
            flag_reason=llm_result.flag_reason,
        )

    return ClassificationResult(flagged=False)
