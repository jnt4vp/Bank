"""Resolve transaction categories from Plaid sync payloads and merchant/description text."""

from __future__ import annotations

# (substring, Plaid-style primary) — longest needles first so specific phrases win.
MERCHANT_CATEGORY_HINTS: list[tuple[str, str]] = sorted(
    [
        ("whole foods", "FOOD_AND_DRINK"),
        ("trader joe", "FOOD_AND_DRINK"),
        ("chipotle", "FOOD_AND_DRINK"),
        ("starbucks", "FOOD_AND_DRINK"),
        ("dunkin", "FOOD_AND_DRINK"),
        ("mcdonald", "FOOD_AND_DRINK"),
        ("taco bell", "FOOD_AND_DRINK"),
        ("subway", "FOOD_AND_DRINK"),
        ("restaurant", "FOOD_AND_DRINK"),
        ("pizzeria", "FOOD_AND_DRINK"),
        ("uber", "TRANSPORTATION"),
        ("lyft", "TRANSPORTATION"),
        ("netflix", "ENTERTAINMENT"),
        ("spotify", "ENTERTAINMENT"),
        ("hulu", "ENTERTAINMENT"),
        ("amazon", "GENERAL_MERCHANDISE"),
        ("walmart", "GENERAL_MERCHANDISE"),
        ("target", "GENERAL_MERCHANDISE"),
        ("costco", "GENERAL_MERCHANDISE"),
        ("cvs", "MEDICAL"),
        ("walgreens", "MEDICAL"),
        ("shell", "TRANSPORTATION"),
        ("exxon", "TRANSPORTATION"),
        ("chevron", "TRANSPORTATION"),
        ("gas station", "TRANSPORTATION"),
        ("electric bill", "RENT_AND_UTILITIES"),
        ("electricity", "RENT_AND_UTILITIES"),
        ("water bill", "RENT_AND_UTILITIES"),
        ("utility bill", "RENT_AND_UTILITIES"),
        ("mortgage", "LOAN_PAYMENTS"),
    ],
    key=lambda pair: -len(pair[0]),
)


def coerce_plaid_category_value(raw) -> str | None:
    """Normalize Plaid OpenAPI enums / strings to a non-empty category token."""
    if raw is None:
        return None
    if hasattr(raw, "value"):
        raw = raw.value
    s = str(raw).strip()
    return s or None


def category_from_plaid_transaction(txn) -> str | None:
    """Best-effort category from Plaid PFC (primary, then detailed), then legacy category[]."""
    pfc = getattr(txn, "personal_finance_category", None)
    if pfc is not None:
        primary = coerce_plaid_category_value(getattr(pfc, "primary", None))
        if primary:
            return primary
        detailed = coerce_plaid_category_value(getattr(pfc, "detailed", None))
        if detailed:
            return detailed
    cats = getattr(txn, "category", None) or []
    if cats:
        return coerce_plaid_category_value(cats[0])
    return None


def infer_category_from_merchant_text(merchant: str, description: str) -> str | None:
    """When Plaid sends no category, map obvious merchant/description text to a coarse bucket."""
    combined = f"{merchant} {description}".lower()
    for needle, cat in MERCHANT_CATEGORY_HINTS:
        if needle in combined:
            return cat
    return None


def resolved_plaid_category(merchant: str, description: str, txn) -> str | None:
    """Category for a Plaid transaction object plus our text fallback."""
    base = category_from_plaid_transaction(txn)
    if base:
        return base
    return infer_category_from_merchant_text(merchant, description)


def infer_category_from_local_fields(
    merchant: str,
    description: str,
    plaid_original_description: str | None = None,
) -> str | None:
    """Infer category from DB-stored fields (no live Plaid payload) — for backfill scripts."""
    extra = f" {plaid_original_description}" if plaid_original_description else ""
    return infer_category_from_merchant_text(merchant, f"{description}{extra}")
