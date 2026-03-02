import json
import logging
from dataclasses import dataclass

import httpx

from ..config import get_settings

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


@dataclass
class ClassificationResult:
    flagged: bool
    category: str | None = None
    flag_reason: str | None = None


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


CLASSIFICATION_PROMPT = """You classify bank transactions. You ONLY flag transactions in these 4 categories:

1. "gambling" - casinos, sports betting, lottery, poker
2. "adult" - pornography, adult entertainment, escort services
3. "alcohol" - liquor stores, bars, alcohol purchases
4. "drugs" - drug paraphernalia, dispensaries, suspicious drug-related purchases

EVERYTHING ELSE IS NOT FLAGGED. Normal purchases like groceries, gas, flowers, clothing, electronics, restaurants, subscriptions, coffee, etc. are NEVER flagged.

Transaction:
- Merchant: {merchant}
- Description: {description}
- Amount: ${amount:.2f}

Respond with ONLY valid JSON (no markdown, no extra text):
{{"flagged": true/false, "reason": "brief explanation", "category": "gambling|adult|alcohol|drugs|null"}}

If the transaction does not clearly fall into one of the 4 categories above, set flagged to false and category to null."""


async def _llm_classify(merchant: str, description: str, amount: float) -> ClassificationResult | None:
    settings = get_settings()
    if not settings.OLLAMA_ENABLED:
        return None

    prompt = CLASSIFICATION_PROMPT.format(
        merchant=merchant, description=description, amount=amount,
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.OLLAMA_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            resp.raise_for_status()

        body = resp.json()
        raw_response = body.get("response", "").strip()
        logger.info("Ollama raw response: %s", raw_response)

        parsed = json.loads(raw_response)
        flagged = bool(parsed.get("flagged", False))
        reason = parsed.get("reason")
        category = parsed.get("category")

        if category == "null" or not category:
            category = None

        return ClassificationResult(
            flagged=flagged,
            category=category,
            flag_reason=f"LLM: {reason}" if flagged and reason else None,
        )

    except httpx.ConnectError:
        logger.warning("Ollama is DOWN or unreachable at %s — skipping LLM classification", settings.OLLAMA_URL)
        return None
    except httpx.TimeoutException:
        logger.warning("Ollama request timed out (10s) at %s — skipping LLM classification", settings.OLLAMA_URL)
        return None
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("Failed to parse Ollama response: %s", exc)
        return None
    except httpx.HTTPStatusError as exc:
        logger.warning("Ollama HTTP error %s — skipping LLM classification", exc.response.status_code)
        return None


async def classify_transaction(merchant: str, description: str, amount: float) -> ClassificationResult:
    rule_result = _rule_based_classify(merchant, description, amount)
    if rule_result is not None:
        logger.info(
            "Rule-based flag: %s | %s | $%.2f → %s (%s)",
            merchant, description, amount, rule_result.category, rule_result.flag_reason,
        )
        return rule_result

    llm_result = await _llm_classify(merchant, description, amount)
    if llm_result is not None:
        logger.info(
            "LLM classification: %s | %s | $%.2f → flagged=%s category=%s",
            merchant, description, amount, llm_result.flagged, llm_result.category,
        )
        return llm_result

    return ClassificationResult(flagged=False)
