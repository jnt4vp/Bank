from __future__ import annotations

from typing import Protocol


class NotifierPort(Protocol):
    async def send_password_reset(
        self,
        *,
        to_email: str,
        reset_url: str,
    ) -> None:
        """Send a password reset message."""

    async def send_transaction_alert(
        self,
        *,
        to_email: str | None,
        merchant: str,
        amount: float,
        category: str | None,
        flag_reason: str | None,
    ) -> None:
        """Send a flagged transaction alert."""
