"""
Attribute transactions to user-defined goals using:
1) Rule-based: preset pact keywords, user keywords/merchants/subcategories, hints, weak label match
2) Optional Ollama: broad taxonomy → map via user subcategories, then rich goal+signals assignment
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..models.transaction import Transaction
from ..models.user import User
from ..repositories.transactions import get_transactions_for_user
from ..schemas.goals import GoalAttributionSpec
from .classifier import PACT_CATEGORY_KEYWORDS
from .discipline import normalize_discipline_start

_CATEGORY_HINTS: dict[str, tuple[str, ...]] = {
    "food": ("food", "restaurant", "dining", "grocer", "coffee", "cafe", "fast food", "meal"),
    "shop": ("shop", "retail", "merch", "store", "amazon", "clothing", "apparel"),
    "shopping": ("shop", "retail", "merch", "store", "amazon", "clothing", "apparel", "online"),
    "entertain": ("entertain", "movie", "game", "music", "stream", "ticket", "sport"),
    "travel": ("travel", "hotel", "airline", "flight", "uber", "lyft", "gas", "fuel"),
    "beauty": ("beauty", "salon", "spa", "cosmetic", "sephora", "ulta", "barber", "hair"),
    "health": ("health", "pharmacy", "gym", "fitness", "medical", "dental", "vet"),
    "home": ("home", "furniture", "hardware", "garden", "decor"),
    "fun": ("fun", "party", "leisure", "hobby", "arcade", "event", "bowling", "concert"),
}


def _match_keywords(text_lower: str, keywords: list[str]) -> str | None:
    for kw in keywords:
        if kw in text_lower:
            return kw
    return None


def _category_field_norm(category: str | None) -> str:
    if not category:
        return ""
    return category.replace("_", " ").lower().strip()


def _combined_text(
    merchant: str,
    description: str,
    plaid_original: str | None,
    category: str | None,
) -> str:
    cat = _category_field_norm(category)
    parts = [merchant or "", description or "", plaid_original or "", cat]
    return " ".join(parts).lower()


def _hint_tokens_for_goal(goal_key: str) -> frozenset[str]:
    hints = _CATEGORY_HINTS.get(goal_key)
    if hints:
        return frozenset(hints)
    return frozenset()


def _norm_signal_list(items: list[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        s = str(x).strip().lower()
        if not s or len(s) > 80 or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return tuple(out)


@dataclass(frozen=True)
class GoalSpec:
    key: str
    display: str
    keywords: tuple[str, ...]
    merchants: tuple[str, ...]
    subcategories: tuple[str, ...]


def build_goal_specs(goals: list[GoalAttributionSpec]) -> list[GoalSpec]:
    specs: list[GoalSpec] = []
    for g in goals:
        cat = g.category.strip()
        key = cat.lower()
        specs.append(
            GoalSpec(
                key=key,
                display=cat,
                keywords=_norm_signal_list(g.keywords),
                merchants=_norm_signal_list(g.merchants),
                subcategories=_norm_signal_list(g.subcategories),
            )
        )
    return specs


def rule_match_transaction_to_specs(
    merchant: str,
    description: str,
    plaid_original: str | None,
    category: str | None,
    specs: list[GoalSpec],
) -> str | None:
    combined = _combined_text(merchant, description, plaid_original, category)
    cat_norm = _category_field_norm(category)
    merchant_lower = (merchant or "").lower()
    desc_lower = (description or "").lower()

    for spec in specs:
        goal_key = spec.key

        preset_kw = PACT_CATEGORY_KEYWORDS.get(goal_key, [])
        if preset_kw:
            hit = _match_keywords(combined, preset_kw)
            if hit:
                return goal_key

        for kw in spec.keywords:
            if kw in combined:
                return goal_key

        for m in spec.merchants:
            if m in merchant_lower or m in desc_lower:
                return goal_key

        for sub in spec.subcategories:
            sub_s = sub.replace("_", " ")
            if sub_s in combined or sub_s in cat_norm:
                return goal_key

        for token in _hint_tokens_for_goal(goal_key):
            if token in combined:
                return goal_key

        if goal_key and goal_key in combined:
            return goal_key

        if goal_key and cat_norm and (goal_key in cat_norm or cat_norm in goal_key):
            return goal_key

        words = [w for w in goal_key.split() if len(w) >= 2]
        if words and all((w in combined) or (w in cat_norm) for w in words):
            return goal_key

    return None


def _broad_matches_user_sub(broad: str, user_sub: str) -> bool:
    b = broad.strip().lower()
    u = user_sub.strip().lower().replace("_", " ")
    if not b or not u:
        return False
    if b == u:
        return True
    if b in u or u in b:
        return True
    return False


def map_broad_to_goal_key(broad: str, specs: list[GoalSpec]) -> str | None:
    """First goal in list order whose subcategories accept this broad label."""
    b = broad.strip().lower()
    if not b:
        return None
    for spec in specs:
        for sub in spec.subcategories:
            if _broad_matches_user_sub(b, sub):
                return spec.key
    return None


def rule_match_transaction_to_goal(
    merchant: str,
    description: str,
    plaid_original: str | None,
    category: str | None,
    goal_order: list[str],
) -> str | None:
    """Backward-compatible: goals as plain names, no extra signals."""
    specs = [
        GoalSpec(key=k, display=k, keywords=tuple(), merchants=tuple(), subcategories=tuple())
        for k in goal_order
    ]
    return rule_match_transaction_to_specs(
        merchant, description, plaid_original, category, specs
    )


def _transaction_effective_date(tx: Transaction) -> date:
    if tx.date is not None:
        return tx.date
    created = tx.created_at
    if created.tzinfo is None or created.tzinfo.utcoffset(created) is None:
        created = created.replace(tzinfo=timezone.utc)
    else:
        created = created.astimezone(timezone.utc)
    return created.date()


def _in_discipline_window(tx: Transaction, user: User) -> bool:
    if user.discipline_score_started_at is None:
        return False
    start = normalize_discipline_start(user.discipline_score_started_at)
    created = tx.created_at
    if created.tzinfo is None or created.tzinfo.utcoffset(created) is None:
        created = created.replace(tzinfo=timezone.utc)
    else:
        created = created.astimezone(timezone.utc)
    return created >= start


def _in_calendar_period(tx: Transaction, period_start: date, period_end: date) -> bool:
    d = _transaction_effective_date(tx)
    return period_start <= d <= period_end


def _tx_batch_rows(txs: list[Transaction]) -> list[tuple[str, str, str, str | None, float]]:
    return [
        (
            str(tx.id),
            tx.merchant or "",
            tx.description or "",
            tx.category,
            float(tx.amount or 0),
        )
        for tx in txs
    ]


async def compute_goal_spending(
    db: AsyncSession,
    user: User,
    *,
    goals: list[GoalAttributionSpec],
    period_start: date,
    period_end: date,
    settings: Settings,
) -> tuple[dict[str, float], str, int]:
    from ..infrastructure.classifiers.ollama_goals import (
        GoalSpecPublic,
        assign_broad_category_batch_llm,
        assign_goal_labels_rich_batch_llm,
    )

    specs = build_goal_specs(goals)
    if not specs:
        return {}, "rules", 0

    order_keys = [s.key for s in specs]
    spent: dict[str, float] = {k: 0.0 for k in order_keys}

    all_txs = await get_transactions_for_user(db, user.id)
    candidates: list[Transaction] = []
    for tx in all_txs:
        if not _in_discipline_window(tx, user):
            continue
        if not _in_calendar_period(tx, period_start, period_end):
            continue
        candidates.append(tx)

    unmatched: list[Transaction] = []
    for tx in candidates:
        g = rule_match_transaction_to_specs(
            tx.merchant or "",
            tx.description or "",
            tx.plaid_original_description,
            tx.category,
            specs,
        )
        if g is not None:
            spent[g] = spent.get(g, 0.0) + float(tx.amount or 0)
        else:
            unmatched.append(tx)

    llm_count = 0
    any_subcats = any(spec.subcategories for spec in specs)

    if unmatched and settings.OLLAMA_ENABLED:
        batch_payload = _tx_batch_rows(unmatched)

        if any_subcats:
            broad_map = await assign_broad_category_batch_llm(
                transactions=batch_payload,
                settings=settings,
            )
            still: list[Transaction] = []
            for tx in unmatched:
                broad = broad_map.get(str(tx.id))
                if broad:
                    gk = map_broad_to_goal_key(broad, specs)
                    if gk:
                        spent[gk] = spent.get(gk, 0.0) + float(tx.amount or 0)
                        llm_count += 1
                        continue
                still.append(tx)
            unmatched = still

        if unmatched:
            public_goals = [
                GoalSpecPublic(
                    display=s.display,
                    keywords=s.keywords,
                    merchants=s.merchants,
                    subcategories=s.subcategories,
                )
                for s in specs
            ]
            rich_map = await assign_goal_labels_rich_batch_llm(
                transactions=_tx_batch_rows(unmatched),
                goals=public_goals,
                settings=settings,
            )
            display_to_key = {s.display.strip().lower(): s.key for s in specs}
            for tx in unmatched:
                raw = rich_map.get(str(tx.id))
                if not raw:
                    continue
                low = str(raw).strip().lower()
                gkey = display_to_key.get(low)
                if gkey is None:
                    for s in specs:
                        if s.display.strip().lower() == low:
                            gkey = s.key
                            break
                if gkey is None:
                    continue
                spent[gkey] = spent.get(gkey, 0.0) + float(tx.amount or 0)
                llm_count += 1

    method = "rules+llm" if llm_count else "rules"
    return spent, method, llm_count
