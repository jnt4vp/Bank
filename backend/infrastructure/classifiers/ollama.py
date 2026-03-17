from __future__ import annotations

import json
import logging

import httpx

from ...config import get_settings
from ...ports.classifier import ClassificationResult

logger = logging.getLogger("bank.classifier")

def _build_prompt(
    merchant: str, description: str, amount: float,
    user_categories: list[str] | None = None,
) -> str:
    normalized_categories = [
        cat.strip().lower()
        for cat in (user_categories or [])
        if cat and cat.strip()
    ]
    if not normalized_categories:
        raise ValueError("user_categories is required for pact-aware classification")

    all_categories = "\n".join(
        f'{i}. "{cat}" - an active pact category the user explicitly configured'
        for i, cat in enumerate(normalized_categories, start=1)
    )
    valid_values = "|".join(normalized_categories) + "|null"

    return f"""You classify bank transactions for a pact system.

Only flag a transaction if it clearly matches one of the user's active pact categories:

{all_categories}

If the transaction does not match one of those active pact categories, it is not flagged.

Transaction:
- Merchant: {merchant}
- Description: {description}
- Amount: ${amount:.2f}

Respond with ONLY valid JSON (no markdown, no extra text):
{{"flagged": true/false, "reason": "brief explanation", "category": "{valid_values}"}}

If the transaction does not clearly fall into one of the categories above, set flagged to false and category to null."""


class OllamaClassifierAdapter:
    async def classify_transaction(
        self,
        *,
        merchant: str,
        description: str,
        amount: float,
        user_categories: list[str] | None = None,
    ) -> ClassificationResult | None:
        settings = get_settings()
        if not settings.OLLAMA_ENABLED:
            return None
        if not user_categories:
            return None

        prompt = _build_prompt(merchant, description, amount, user_categories)

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
