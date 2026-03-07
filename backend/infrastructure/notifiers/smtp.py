from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ...config import get_settings

logger = logging.getLogger("bank.email")


class SmtpNotifier:
    async def send_password_reset(
        self,
        *,
        to_email: str,
        reset_url: str,
    ) -> None:
        settings = get_settings()
        if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
            logger.warning("Gmail credentials not configured — skipping reset email")
            return

        subject = "Reset your BankSpank password"
        body = "\n".join([
            "Hi,",
            "",
            "We received a request to reset your BankSpank password.",
            "Click the link below to set a new password (expires in 1 hour):",
            "",
            f"  {reset_url}",
            "",
            "If you didn't request this, you can safely ignore this email.",
        ])

        await asyncio.to_thread(
            self._send_message,
            from_email=settings.GMAIL_USER,
            to_email=to_email,
            password=settings.GMAIL_APP_PASSWORD,
            subject=subject,
            body=body,
            success_message=f"Password reset email sent to {to_email}",
        )

    async def send_transaction_alert(
        self,
        *,
        to_email: str | None,
        merchant: str,
        amount: float,
        category: str | None,
        flag_reason: str | None,
    ) -> None:
        settings = get_settings()
        if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
            logger.warning("Gmail credentials not configured — skipping alert email")
            return

        recipient = to_email or settings.ALERT_EMAIL
        if not recipient:
            logger.warning("No recipient address available — skipping alert email")
            return

        subject = f"Flagged transaction: {merchant} (${amount:.2f})"
        body = "\n".join([
            "A transaction on your account has been flagged for review.",
            "",
            f"  Merchant : {merchant}",
            f"  Amount   : ${amount:.2f}",
            f"  Category : {category or 'unknown'}",
            f"  Reason   : {flag_reason or 'suspicious activity'}",
            "",
            "If you did not authorise this transaction, please contact support immediately.",
        ])

        await asyncio.to_thread(
            self._send_message,
            from_email=settings.GMAIL_USER,
            to_email=recipient,
            password=settings.GMAIL_APP_PASSWORD,
            subject=subject,
            body=body,
            success_message=f"Alert email sent to {recipient} for flagged merchant '{merchant}'",
        )

    def _send_message(
        self,
        *,
        from_email: str,
        to_email: str,
        password: str,
        subject: str,
        body: str,
        success_message: str,
    ) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email
        msg.attach(MIMEText(body, "plain"))

        try:
            with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.login(from_email, password)
                smtp.sendmail(from_email, to_email, msg.as_string())
            logger.info(success_message)
        except smtplib.SMTPAuthenticationError:
            logger.error("Gmail authentication failed — check GMAIL_USER and GMAIL_APP_PASSWORD")
        except smtplib.SMTPException as exc:
            logger.error("Failed to send email: %s", exc)
