from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, ForeignKey
from datetime import datetime, timezone

class Argument(Base):
    __tablename__ = "arguments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"))
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    round_index: Mapped[int] = mapped_column(Integer)
    turn_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
