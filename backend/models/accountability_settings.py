import uuid

from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base


class AccountabilitySettings(Base):
    __tablename__ = "accountability_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pact_id = Column(UUID(as_uuid=True), ForeignKey("pacts.id", ondelete="CASCADE"), nullable=False, unique=True)

    accountability_type = Column(String, nullable=False)
    discipline_savings_percentage = Column(Float, nullable=False)
    accountability_note = Column(String, nullable=True)

    pact = relationship("Pact", back_populates="accountability_settings")