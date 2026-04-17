import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base


class Pact(Base):
    __tablename__ = "pacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    preset_category = Column(String, nullable=True)
    custom_category = Column(String, nullable=True)
    category = Column(String, nullable=False)
    status = Column(String, nullable=False, default="active")
    locked_until = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="pacts")
    accountability_settings = relationship(
        "AccountabilitySettings",
        back_populates="pact",
        uselist=False,
        passive_deletes=True,
    )
