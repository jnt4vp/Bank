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

Only flag a transaction if the MERCHANT genuinely belongs to one of these active pact categories:

{all_categories}

Strict rules — false positives are worse than false negatives:
- Flag only if the merchant's primary business clearly fits the category (e.g. "dining out" = restaurants, cafes, food delivery; not airlines, ride-shares, gyms, bike shops, grocery stores, utilities, paychecks, interest, deposits, or transfers).
- Paychecks, ACH credits, interest payments, CD/savings deposits, credit-card payments, and bank transfers are NEVER flagged.
- If you're unsure, set flagged=false. Do NOT guess a category just because the user has one active.

Transaction:
- Merchant: {merchant}
- Description: {description}
- Amount: ${amount:.2f}

Respond with ONLY valid JSON (no markdown, no extra text):
{{"flagged": true/false, "reason": "brief explanation", "category": "{valid_values}"}}

If the transaction does not clearly fit one of the listed categories, set flagged=false and category=null."""


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
            timeout = httpx.Timeout(settings.OLLAMA_TIMEOUT)
            async with httpx.AsyncClient(timeout=timeout) as client:
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
            logger.debug("Ollama raw response: %s", raw_response)

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
                "Ollama request timed out (%.0fs) at %s — skipping LLM classification",
                settings.OLLAMA_TIMEOUT,
                settings.OLLAMA_URL,
            )
            return None
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.debug("Failed to parse Ollama response: %s", exc)
            return None
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Ollama HTTP error %s — skipping LLM classification",
                exc.response.status_code,
            )
            return None
