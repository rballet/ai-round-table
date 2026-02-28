from typing import Optional
from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import JSON, String, ForeignKey

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    display_name: Mapped[str] = mapped_column(String)
    persona_description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    expertise: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    llm_provider: Mapped[str] = mapped_column(String)
    llm_model: Mapped[str] = mapped_column(String)
    llm_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    role: Mapped[str] = mapped_column(String)

    session: Mapped["Session"] = relationship("Session", back_populates="agents")
