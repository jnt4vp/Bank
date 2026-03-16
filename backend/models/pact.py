import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID

from ..database import Base


class Pact(Base):
    __tablename__ = "pacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), nullable=True)

    preset_category = Column(String, nullable=True)
    custom_category = Column(String, nullable=True)
    category = Column(String, nullable=False)

    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)