from __future__ import annotations

import json
import logging
import time
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


def _httpx_timeout(settings: Settings) -> httpx.Timeout:
    return httpx.Timeout(settings.OLLAMA_TIMEOUT)


def _tx_line(tid: str, merchant: str, desc: str, cat: str | None, amount: float) -> str:
    c = (cat or "").replace("|", " ")
    return (
        f"{tid}|{(merchant or '')[:72]}|{(desc or '')[:96]}|{c[:32]}|{amount:.2f}"
    )


def _build_broad_prompt(*, lines: list[str]) -> str:
    labels = ",".join(BROAD_SPENDING_LABELS)
    txn_block = "\n".join(lines)
    return (
        f"Pick one label per line from: {labels}\n"
        f'JSON only: {{"broad_categories":{{"<id>":"<label>",...}}}}\n'
        f"id|merchant|desc|cat|amount:\n{txn_block}"
    )


def _json_preview(obj: object, limit: int = 200) -> str:
    try:
        s = json.dumps(obj, default=str)
    except (TypeError, ValueError):
        s = repr(obj)
    if len(s) > limit:
        return s[: limit - 1] + "…"
    return s


def _assignments_list_to_dict(items: list) -> dict[str, object]:
    """Turn list-shaped model output into id → label (mirrors assignments dict)."""
    out: dict[str, object] = {}
    id_keys = ("transaction_id", "id", "txn_id", "txn")
    goal_keys = ("goal", "assignment", "label", "category", "name", "value", "goal_name")
    for el in items:
        if isinstance(el, dict):
            tid = None
            for ik in id_keys:
                if ik in el and el[ik] is not None:
                    tid = str(el[ik]).strip()
                    break
            val = None
            for gk in goal_keys:
                if gk in el:
                    val = el[gk]
                    break
            if tid:
                out[tid] = val
        elif isinstance(el, (list, tuple)) and len(el) >= 2:
            out[str(el[0]).strip()] = el[1]
    return out


def _parse_rich_assignments(parsed: object) -> dict[str, object]:
    """Normalize Ollama JSON to a single id → goal | null mapping."""
    if isinstance(parsed, dict):
        assigns = parsed.get("assignments")
        if assigns is None:
            assigns = {}
        if isinstance(assigns, dict):
            return {str(k): v for k, v in assigns.items()}
        if isinstance(assigns, list):
            return _assignments_list_to_dict(assigns)
        logger.warning(
            "Rich goal: assignments field has unexpected type %s, preview=%s",
            type(assigns).__name__,
            _json_preview(parsed),
        )
        return {}

    if isinstance(parsed, list):
        return _assignments_list_to_dict(parsed)

    logger.warning(
        "Rich goal: unexpected JSON root type %s, preview=%s",
        type(parsed).__name__,
        _json_preview(parsed),
    )
    return {}


def _build_rich_prompt(*, lines: list[str], goals: list[GoalSpecPublic]) -> str:
    allowed = [g.display for g in goals]
    allowed_json = json.dumps(allowed)
    parts: list[str] = []
    for g in goals:
        bits: list[str] = []
        if g.keywords:
            bits.append("kw:" + ",".join(g.keywords[:2]))
        if g.merchants:
            bits.append("m:" + ",".join(g.merchants[:2]))
        if g.subcategories:
            bits.append("t:" + ",".join(g.subcategories[:3]))
        if bits:
            parts.append(f"{g.display} ({'; '.join(bits)})")
        else:
            parts.append(g.display)
    goals_line = " | ".join(parts)
    txn_block = "\n".join(lines)
    return (
        f"Goals: {goals_line}\n"
        f"Each line → one goal name from {allowed_json} or null.\n"
        f'JSON only: {{"assignments":{{"<id>":"<name>"|null,...}}}}\n'
        f"id|m|d|cat|$:\n{txn_block}"
    )


async def assign_broad_category_batch_llm(
    *,
    transactions: list[tuple[str, str, str, str | None, float]],
    settings: Settings,
) -> dict[str, str]:
    """transaction id → broad label (lowercase) or partial dict on per-chunk failures."""
    if not settings.OLLAMA_ENABLED or not transactions:
        return {}

    allowed = {x.lower() for x in BROAD_SPENDING_LABELS}
    chunk_size = max(1, settings.OLLAMA_MAX_BATCH)
    out: dict[str, str] = {}
    timeout = _httpx_timeout(settings)

    async with httpx.AsyncClient(timeout=timeout) as client:
        for start in range(0, len(transactions), chunk_size):
            chunk = transactions[start : start + chunk_size]
            lines = [_tx_line(tid, m, d, c, a) for tid, m, d, c, a in chunk]
            prompt = _build_broad_prompt(lines=lines)
            t0 = time.perf_counter()
            try:
                resp = await client.post(
                    f"{settings.OLLAMA_URL}/api/generate",
                    json={
                        "model": settings.OLLAMA_MODEL,
                        "prompt": prompt,
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                elapsed = time.perf_counter() - t0
                logger.info(
                    "Ollama broad goal batch chunk ok in %.2fs (%d txns, timeout=%ss)",
                    elapsed,
                    len(chunk),
                    settings.OLLAMA_TIMEOUT,
                )
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
                elapsed = time.perf_counter() - t0
                logger.warning(
                    "Ollama timeout for broad goal batch after %.2fs (%d txns, timeout=%ss) — skipping chunk, continuing",
                    elapsed,
                    len(chunk),
                    settings.OLLAMA_TIMEOUT,
                )
                continue
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "Ollama HTTP %s for broad goal batch: %s",
                    exc.response.status_code,
                    (exc.response.text or "")[:200],
                )
                break
            except (json.JSONDecodeError, TypeError, KeyError) as exc:
                elapsed = time.perf_counter() - t0
                logger.debug("Broad batch parse error after %.2fs: %s", elapsed, exc)
                continue

    return out


async def assign_goal_labels_rich_batch_llm(
    *,
    transactions: list[tuple[str, str, str, str | None, float]],
    goals: list[GoalSpecPublic],
    settings: Settings,
) -> dict[str, str | None]:
    """Map txn id → goal display or None; returns partial results if some chunks fail."""
    if not settings.OLLAMA_ENABLED or not transactions or not goals:
        return {}

    chunk_size = max(1, settings.OLLAMA_MAX_BATCH)
    out: dict[str, str | None] = {}
    allowed = {g.display.strip().lower(): g.display for g in goals}
    timeout = _httpx_timeout(settings)

    async with httpx.AsyncClient(timeout=timeout) as client:
        for start in range(0, len(transactions), chunk_size):
            chunk = transactions[start : start + chunk_size]
            lines = [_tx_line(tid, m, d, c, a) for tid, m, d, c, a in chunk]
            prompt = _build_rich_prompt(lines=lines, goals=goals)
            t0 = time.perf_counter()
            try:
                resp = await client.post(
                    f"{settings.OLLAMA_URL}/api/generate",
                    json={
                        "model": settings.OLLAMA_MODEL,
                        "prompt": prompt,
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                elapsed = time.perf_counter() - t0
                logger.info(
                    "Ollama rich goal batch chunk ok in %.2fs (%d txns, timeout=%ss)",
                    elapsed,
                    len(chunk),
                    settings.OLLAMA_TIMEOUT,
                )
                body = resp.json()
                raw = (body.get("response") or "").strip()
                parsed = json.loads(raw)
                assigns = _parse_rich_assignments(parsed)
                if not assigns:
                    continue
                for tid, val in assigns.items():
                    tid_s = str(tid).strip()
                    if not tid_s:
                        continue
                    if val is None or val == "null" or str(val).lower() == "null":
                        out[tid_s] = None
                        continue
                    label = str(val).strip()
                    low = label.lower()
                    if low in allowed:
                        out[tid_s] = allowed[low]
                    else:
                        for al, orig in allowed.items():
                            if orig.lower() == low:
                                out[tid_s] = orig
                                break
            except httpx.ConnectError:
                logger.warning("Ollama unreachable for rich goal batch")
                break
            except httpx.TimeoutException:
                elapsed = time.perf_counter() - t0
                logger.warning(
                    "Ollama timeout for rich goal batch after %.2fs (%d txns, timeout=%ss) — skipping chunk, continuing",
                    elapsed,
                    len(chunk),
                    settings.OLLAMA_TIMEOUT,
                )
                continue
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "Ollama HTTP %s for rich goal batch: %s",
                    exc.response.status_code,
                    (exc.response.text or "")[:200],
                )
                break
            except (json.JSONDecodeError, TypeError, KeyError) as exc:
                elapsed = time.perf_counter() - t0
                logger.debug("Rich batch parse error after %.2fs: %s", elapsed, exc)
                continue

    return out
