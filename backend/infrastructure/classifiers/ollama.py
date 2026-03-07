from __future__ import annotations

import json
import logging

import httpx

from ...config import get_settings
from ...ports.classifier import ClassificationResult

logger = logging.getLogger("bank.classifier")

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


class OllamaClassifierAdapter:
    async def classify_transaction(
        self,
        *,
        merchant: str,
        description: str,
        amount: float,
    ) -> ClassificationResult | None:
        settings = get_settings()
        if not settings.OLLAMA_ENABLED:
            return None

        prompt = CLASSIFICATION_PROMPT.format(
            merchant=merchant,
            description=description,
            amount=amount,
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
            logger.warning(
                "Ollama is DOWN or unreachable at %s — skipping LLM classification",
                settings.OLLAMA_URL,
            )
            return None
        except httpx.TimeoutException:
            logger.warning(
                "Ollama request timed out (10s) at %s — skipping LLM classification",
                settings.OLLAMA_URL,
            )
            return None
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.warning("Failed to parse Ollama response: %s", exc)
            return None
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Ollama HTTP error %s — skipping LLM classification",
                exc.response.status_code,
            )
            return None
