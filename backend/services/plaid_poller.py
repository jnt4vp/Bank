import asyncio
import logging

from ..config import get_settings
from ..dependencies.integrations import get_classifier, get_notifier
from .plaid_service import sync_all_items

logger = logging.getLogger(__name__)

_poll_task: asyncio.Task | None = None


async def _poll_loop() -> None:
    settings = get_settings()
    interval = settings.PLAID_POLL_INTERVAL_MINUTES * 60

    if not settings.PLAID_CLIENT_ID or not settings.PLAID_SECRET:
        logger.info("Plaid credentials not configured — poller disabled")
        return

    logger.info(
        "Plaid poller started (every %d minutes)", settings.PLAID_POLL_INTERVAL_MINUTES
    )

    classifier = get_classifier()
    notifier = get_notifier()

    while True:
        await asyncio.sleep(interval)
        try:
            synced = await sync_all_items(classifier=classifier, notifier=notifier)
            if synced:
                logger.debug("Plaid poll complete — synced %d items", synced)
        except Exception:
            logger.exception("Plaid poll cycle failed")


def start_poller() -> None:
    global _poll_task
    if _poll_task is None or _poll_task.done():
        _poll_task = asyncio.create_task(_poll_loop())


def stop_poller() -> None:
    global _poll_task
    if _poll_task and not _poll_task.done():
        _poll_task.cancel()
        _poll_task = None
