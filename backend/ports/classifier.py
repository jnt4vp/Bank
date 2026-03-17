from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ClassificationResult:
    flagged: bool
    category: str | None = None
    flag_reason: str | None = None


class ClassifierPort(Protocol):
    async def classify_transaction(
        self,
        *,
        merchant: str,
        description: str,
        amount: float,
        user_categories: list[str] | None = None,
    ) -> ClassificationResult | None:
        """Return a classification result or None when no decision is available."""
