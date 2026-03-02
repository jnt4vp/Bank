import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from ..database import get_db
from ..repositories.transactions import create_transaction, get_all_transactions
from ..schemas.transaction import TransactionCreate, TransactionResponse
from ..services.classifier import classify_transaction

logger = logging.getLogger("bank.transactions")

router = APIRouter()


@router.post("/", response_model=TransactionResponse)
async def ingest_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
):
    classification = await classify_transaction(
        merchant=payload.merchant,
        description=payload.description,
        amount=payload.amount,
    )

    txn = await create_transaction(
        db,
        user_id=payload.user_id,
        merchant=payload.merchant,
        description=payload.description,
        amount=payload.amount,
        category=classification.category,
        flagged=classification.flagged,
        flag_reason=classification.flag_reason,
    )

    logger.info(
        "NEW TRANSACTION  |  %s  |  %s  |  $%.2f  |  \"%s\"  |  id=%s  |  flagged=%s",
        txn.merchant,
        txn.user_id,
        float(txn.amount),
        txn.description,
        txn.id,
        txn.flagged,
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

@router.get("/", response_model=List[TransactionResponse])
async def list_transactions(
    db: AsyncSession = Depends(get_db),
):
    return await get_all_transactions(db)