from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import JSON, String, DateTime
from datetime import datetime, timezone
from typing import Optional


class SessionTemplate(Base):
    __tablename__ = "session_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    agents: Mapped[list] = mapped_column(JSON, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
