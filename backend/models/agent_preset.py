from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Boolean, String


class AgentPreset(Base):
    __tablename__ = "agent_presets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    persona_description: Mapped[str] = mapped_column(String, nullable=False)
    expertise: Mapped[str] = mapped_column(String, nullable=False)
    suggested_model: Mapped[str] = mapped_column(String, nullable=False)
    llm_provider: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
