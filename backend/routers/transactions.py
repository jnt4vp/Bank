from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from ..application.transactions import ingest_user_transaction
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..dependencies.integrations import get_classifier, get_notifier
from ..models.user import User
from ..ports.classifier import ClassifierPort
from ..ports.notifier import NotifierPort
from ..repositories.transactions import get_transactions_for_user
from ..schemas.transaction import TransactionCreate, TransactionResponse

router = APIRouter()


@router.post("/", response_model=TransactionResponse)
async def ingest_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    classifier: ClassifierPort = Depends(get_classifier),
    notifier: NotifierPort = Depends(get_notifier),
):
    return await ingest_user_transaction(
        db,
        user_id=current_user.id,
        user_email=current_user.email,
        merchant=payload.merchant,
        description=payload.description,
        amount=payload.amount,
        classifier=classifier,
        notifier=notifier,
    )

@router.get("/", response_model=List[TransactionResponse])
async def list_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_transactions_for_user(db, current_user.id)
