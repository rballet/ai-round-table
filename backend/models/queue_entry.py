from typing import Optional
from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Float, DateTime, ForeignKey
from datetime import datetime, timezone

class QueueEntry(Base):
    __tablename__ = "queue_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"))
    novelty_tier: Mapped[str] = mapped_column(String)
    justification: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    priority_score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
