from typing import Optional
from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import JSON, String, DateTime
from datetime import datetime, timezone

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    topic: Mapped[str] = mapped_column(String)
    supporting_context: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String)
    config: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    termination_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    agents: Mapped[list["Agent"]] = relationship("Agent", back_populates="session")
