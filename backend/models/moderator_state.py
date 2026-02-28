from core.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, JSON, ForeignKey

class ModeratorState(Base):
    __tablename__ = "moderator_states"

    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), primary_key=True)
    claim_registry: Mapped[dict] = mapped_column(JSON)
    alignment_map: Mapped[dict] = mapped_column(JSON)
    rounds_elapsed: Mapped[int] = mapped_column(Integer, default=0)
    novel_claims_last_round: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_empty_rounds: Mapped[int] = mapped_column(Integer, default=0)
