from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ...config import Settings

logger = logging.getLogger("bank.goals.llm")

# Closed vocabulary for step 1 — map into user subcategories (e.g. "fun" → entertainment, gaming).
BROAD_SPENDING_LABELS: tuple[str, ...] = (
    "entertainment",
    "shopping",
    "dining",
    "groceries",
    "travel",
    "health",
    "beauty",
    "home",
    "transport",
    "gaming",
    "nightlife",
    "fitness",
    "gifts",
    "subscriptions",
    "services",
    "other",
)


@dataclass(frozen=True)
class GoalSpecPublic:
    """Minimal shape for LLM prompts (serializable)."""

    display: str
    keywords: tuple[str, ...]
    merchants: tuple[str, ...]
    subcategories: tuple[str, ...]


def _build_broad_prompt(*, lines: list[str]) -> str:
    labels_json = json.dumps(list(BROAD_SPENDING_LABELS))
    txn_block = "\n".join(lines)
    return f"""Classify each bank transaction into exactly ONE broad spending theme from this list:
{labels_json}

Transactions (id|merchant|description|bank_category|amount):
{txn_block}

Respond with ONLY valid JSON (no markdown):
{{"broad_categories": {{"<transaction_id>": "<label>", ...}}}}

Use only labels from the list. Use "other" when nothing fits."""


def _build_rich_prompt(*, lines: list[str], goals: list[GoalSpecPublic]) -> str:
    blocks = []
    for i, g in enumerate(goals, 1):
        kw = ", ".join(g.keywords) if g.keywords else "(none)"
        mer = ", ".join(g.merchants) if g.merchants else "(none)"
        sub = ", ".join(g.subcategories) if g.subcategories else "(none)"
        blocks.append(
            f'{i}. Goal name: "{g.display}"\n'
            f"   Keywords (text may contain): {kw}\n"
            f"   Merchants (name may contain): {mer}\n"
            f"   Theme buckets for fuzzy matches: {sub}"
        )
    goals_block = "\n\n".join(blocks)
    allowed = [g.display for g in goals]
    allowed_json = json.dumps(allowed)
    txn_block = "\n".join(lines)
    return f"""Assign each transaction to at most ONE user spending goal, or null.

{goals_block}

Transactions (id|merchant|description|bank_category|amount):
{txn_block}

Respond with ONLY valid JSON (no markdown):
{{"assignments": {{"<transaction_id>": "<exact goal name>" | null, ...}}}}

Rules:
- Use null when no goal fits.
- Goal names must be exactly one of: {allowed_json}
"""


async def assign_broad_category_batch_llm(
    *,
    transactions: list[tuple[str, str, str, str | None, float]],
    settings: Settings,
) -> dict[str, str]:
    """transaction id → broad label (lowercase) or empty dict on failure."""
    if not settings.OLLAMA_ENABLED or not transactions:
        return {}

    allowed = {x.lower() for x in BROAD_SPENDING_LABELS}
    chunk_size = 25
    out: dict[str, str] = {}

    for start in range(0, len(transactions), chunk_size):
        chunk = transactions[start : start + chunk_size]
        lines = []
        for tid, merchant, desc, cat, amount in chunk:
            c = (cat or "").replace("|", " ")
            lines.append(
                f"{tid}|{(merchant or '')[:120]}|{(desc or '')[:160]}|{c[:80]}|{amount:.2f}"
            )
        prompt = _build_broad_prompt(lines=lines)

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
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
            raw = (body.get("response") or "").strip()
            parsed = json.loads(raw)
            broad = parsed.get("broad_categories") or parsed.get("broad") or {}
            if not isinstance(broad, dict):
                continue
            for tid, val in broad.items():
                if not val:
                    continue
                lab = str(val).strip().lower()
                if lab in allowed:
                    out[str(tid)] = lab
        except httpx.ConnectError:
            logger.warning("Ollama unreachable for broad goal batch")
            break
        except httpx.TimeoutException:
            logger.warning("Ollama timeout for broad goal batch")
            break
        except (json.JSONDecodeError, TypeError, KeyError) as exc:
            logger.debug("Broad batch parse error: %s", exc)
            continue

    return out


async def assign_goal_labels_rich_batch_llm(
    *,
    transactions: list[tuple[str, str, str, str | None, float]],
    goals: list[GoalSpecPublic],
    settings: Settings,
) -> dict[str, str | None]:
    if not settings.OLLAMA_ENABLED or not transactions or not goals:
        return {}

    chunk_size = 18
    out: dict[str, str | None] = {}
    allowed = {g.display.strip().lower(): g.display for g in goals}

    for start in range(0, len(transactions), chunk_size):
        chunk = transactions[start : start + chunk_size]
        lines = []
        for tid, merchant, desc, cat, amount in chunk:
            c = (cat or "").replace("|", " ")
            lines.append(
                f"{tid}|{(merchant or '')[:120]}|{(desc or '')[:160]}|{c[:80]}|{amount:.2f}"
            )
        prompt = _build_rich_prompt(lines=lines, goals=goals)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
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
            raw = (body.get("response") or "").strip()
            parsed = json.loads(raw)
            assigns = parsed.get("assignments") or {}
            if not isinstance(assigns, dict):
                continue
            for tid, val in assigns.items():
                if val is None or val == "null" or str(val).lower() == "null":
                    out[str(tid)] = None
                    continue
                label = str(val).strip()
                low = label.lower()
                if low in allowed:
                    out[str(tid)] = allowed[low]
                else:
                    for al, orig in allowed.items():
                        if orig.lower() == low:
                            out[str(tid)] = orig
                            break
        except httpx.ConnectError:
            logger.warning("Ollama unreachable for rich goal batch")
            break
        except httpx.TimeoutException:
            logger.warning("Ollama timeout for rich goal batch")
            break
        except (json.JSONDecodeError, TypeError, KeyError) as exc:
            logger.debug("Rich batch parse error: %s", exc)
            continue

    return out


