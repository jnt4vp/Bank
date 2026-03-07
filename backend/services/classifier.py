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


async def classify_transaction(
    classifier: ClassifierPort,
    *,
    merchant: str,
    description: str,
    amount: float,
) -> ClassificationResult:
    rule_result = _rule_based_classify(merchant, description, amount)
    if rule_result is not None:
        logger.info(
            "Rule-based flag: %s | %s | $%.2f → %s (%s)",
            merchant, description, amount, rule_result.category, rule_result.flag_reason,
        )
        return rule_result

    llm_result = await classifier.classify_transaction(
        merchant=merchant,
        description=description,
        amount=amount,
    )
    if llm_result is not None:
        logger.info(
            "LLM classification: %s | %s | $%.2f → flagged=%s category=%s",
            merchant, description, amount, llm_result.flagged, llm_result.category,
        )
        return llm_result

    return ClassificationResult(flagged=False)
