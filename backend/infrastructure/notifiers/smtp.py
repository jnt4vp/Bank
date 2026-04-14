from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ...config import get_settings

logger = logging.getLogger("bank.email")


def _build_alert_content(merchant: str, amount: float, category: str | None) -> tuple[str, str]:
    cat = (category or "").lower()

    if any(k in cat for k in ("dining", "restaurant", "dining out")):
        subject = f"Really? ${amount:.2f} at {merchant}? We saw that."
        opener = "Going out to eat. Again. Your pact is not impressed — and honestly, neither are we."
        closer = "Next time, maybe try the fridge. It's right there. Free, even."

    elif any(k in cat for k in ("coffee", "café", "cafe")):
        subject = f"${amount:.2f} on coffee. You have a coffee maker at home."
        opener = f"Another coffee run to {merchant}. Bold choice. Literally and financially."
        closer = "Your pact is awake. Unlike your self-control, apparently."

    elif any(k in cat for k in ("shopping", "online")):
        subject = f"Congrats on your latest impulse buy at {merchant} (${amount:.2f})"
        opener = "We're not saying it was unnecessary. We're just saying your pact is."
        closer = "Hope it was worth it. Spoiler: it wasn't."

    elif any(k in cat for k in ("entertainment",)):
        subject = f"Having fun? Your pact at {merchant} isn't. (${amount:.2f})"
        opener = "Look, we get it — life is short. But so is your budget."
        closer = "Your pact has been violated. The fun police have been notified."

    elif any(k in cat for k in ("ride", "uber", "lyft", "taxi")):
        subject = f"You paid ${amount:.2f} to sit in a stranger's car."
        opener = f"{merchant} got you again. Ever heard of walking? Your pact has."
        closer = "Your legs work. Your pact is watching."

    elif any(k in cat for k in ("fast food", "fast_food", "fastfood", "mcdonald", "burger", "taco")):
        subject = f"Fast food. Again. ${amount:.2f} at {merchant}."
        opener = "We're not judging. Actually, we are. That's literally what we do."
        closer = "Your pact saw the drive-through receipt. It's not happy."

    elif any(k in cat for k in ("convenience", "gas station", "7-eleven", "corner")):
        subject = f"A convenience store run? How convenient for your pact violation. (${amount:.2f})"
        opener = f"Nothing says 'I broke my pact' like a {merchant} receipt."
        closer = "Your pact didn't need a Slim Jim. You did though, apparently."

    else:
        subject = f"You broke your pact. ${amount:.2f} at {merchant}. We noticed."
        opener = f"Whatever you spent ${amount:.2f} on at {merchant} — your pact didn't approve it."
        closer = "You made a promise. Your pact remembers, even if you don't."

    body = "\n".join([
        opener,
        "",
        f"  Merchant  : {merchant}",
        f"  Amount    : ${amount:.2f}",
        f"  Category  : {category or 'unknown'}",
        "",
        closer,
        "",
        "— PactBank, holding you accountable so you don't have to.",
    ])

    return subject, body


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

        subject, body = _build_alert_content(merchant, amount, category)

        await asyncio.to_thread(
            self._send_message,
            from_email=settings.GMAIL_USER,
            to_email=recipient,
            password=settings.GMAIL_APP_PASSWORD,
            subject=subject,
            body=body,
            success_message=f"Alert email sent to {recipient} for flagged merchant '{merchant}'",
        )

    async def send_accountability_alert(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
    ) -> bool:
        settings = get_settings()
        if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
            logger.warning(
                "Gmail credentials not configured — skipping accountability alert email to %s",
                to_email,
            )
            return False

        logger.info(
            "Attempting accountability alert email to %s with subject %r",
            to_email,
            subject,
        )

        return await asyncio.to_thread(
            self._send_message,
            from_email=settings.GMAIL_USER,
            to_email=to_email,
            password=settings.GMAIL_APP_PASSWORD,
            subject=subject,
            body=body,
            success_message=f"Accountability alert sent to {to_email}",
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
    ) -> bool:
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
            return True
        except smtplib.SMTPAuthenticationError:
            logger.error("Gmail authentication failed — check GMAIL_USER and GMAIL_APP_PASSWORD")
            return False
        except smtplib.SMTPException as exc:
            logger.error("Failed to send email: %s", exc)
            return False
        except Exception:
            logger.exception("Unexpected email delivery failure for %s", to_email)
            return False
