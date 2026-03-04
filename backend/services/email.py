import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import get_settings

logger = logging.getLogger("bank.email")


def send_alert_email(
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

    body_lines = [
        "A transaction on your account has been flagged for review.",
        "",
        f"  Merchant : {merchant}",
        f"  Amount   : ${amount:.2f}",
        f"  Category : {category or 'unknown'}",
        f"  Reason   : {flag_reason or 'suspicious activity'}",
        "",
        "If you did not authorise this transaction, please contact support immediately.",
    ]
    body = "\n".join(body_lines)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.GMAIL_USER
    msg["To"] = recipient
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(settings.GMAIL_USER, settings.GMAIL_APP_PASSWORD)
            smtp.sendmail(settings.GMAIL_USER, recipient, msg.as_string())
        logger.info("Alert email sent to %s for flagged merchant '%s'", recipient, merchant)
    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail authentication failed — check GMAIL_USER and GMAIL_APP_PASSWORD")
    except smtplib.SMTPException as exc:
        logger.error("Failed to send alert email: %s", exc)
