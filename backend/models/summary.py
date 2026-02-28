from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime, ForeignKey
from datetime import datetime, timezone

class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    scribe_agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"))
    content: Mapped[str] = mapped_column(String)
    termination_reason: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
