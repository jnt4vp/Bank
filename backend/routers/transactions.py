import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..repositories.transactions import create_transaction, get_all_transactions
from ..schemas.transaction import TransactionCreate, TransactionResponse

logger = logging.getLogger("bank.transactions")

router = APIRouter()


@router.post("/", response_model=TransactionResponse)
async def ingest_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
):
    txn = await create_transaction(
        db,
        user_id=payload.user_id,
        merchant=payload.merchant,
        description=payload.description,
        amount=payload.amount,
    )

    logger.info(
        "NEW TRANSACTION  |  %s  |  %s  |  $%.2f  |  \"%s\"  |  id=%s",
        txn.merchant,
        txn.user_id,
        float(txn.amount),
        txn.description,
        txn.id,
    )

    all_txns = await get_all_transactions(db)
    logger.info("--- All stored transactions (%d total) ---", len(all_txns))
    for t in all_txns:
        logger.info(
            "  [%s]  %s  $%.2f  \"%s\"  category=%s  flagged=%s",
            t.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            t.merchant,
            float(t.amount),
            t.description,
            t.category or "-",
            t.flagged,
        )

    return txn
