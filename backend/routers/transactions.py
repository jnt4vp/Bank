import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..repositories.transactions import create_transaction, get_transactions_for_user
from ..schemas.transaction import TransactionCreate, TransactionResponse
from ..services.classifier import classify_transaction
from ..services.email import send_alert_email

logger = logging.getLogger("bank.transactions")

router = APIRouter()


@router.post("/", response_model=TransactionResponse)
async def ingest_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    classification = await classify_transaction(
        merchant=payload.merchant,
        description=payload.description,
        amount=payload.amount,
    )

    txn = await create_transaction(
        db,
        user_id=current_user.id,
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

    if txn.flagged:
        send_alert_email(
            to_email=current_user.email,
            merchant=txn.merchant,
            amount=float(txn.amount),
            category=txn.category,
            flag_reason=txn.flag_reason,
        )

    return txn

@router.get("/", response_model=List[TransactionResponse])
async def list_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_transactions_for_user(db, current_user.id)
