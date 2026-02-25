from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Counter(Base):
    __tablename__ = "counter"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
