from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from engine.broadcast_manager import BroadcastManager
from engine.context import AgentContext, ContextBundle
from llm.client import LLMClient
from llm.prompts.think import build_think_messages
from models.thought import Thought
from services import thought_service


class AgentRunner:
    def __init__(
        self,
        *,
        session_id: str,
        db: AsyncSession,
        llm_client: LLMClient,
        broadcast_manager: BroadcastManager,
    ) -> None:
        self._session_id = session_id
        self._db = db
        self._llm_client = llm_client
        self._broadcast_manager = broadcast_manager

    async def think(
        self,
        agent: AgentContext,
        context_bundle: ContextBundle,
    ) -> Thought:
        await self._broadcast("THINK_START", {"agent_id": agent.id})
        try:
            completion = await self._llm_client.complete(
                provider=agent.llm_provider,
                model=agent.llm_model,
                messages=build_think_messages(context_bundle),
                config=agent.llm_config or {},
            )
            return await thought_service.save_thought(
                self._db,
                session_id=self._session_id,
                agent_id=agent.id,
                content=completion,
            )
        finally:
            await self._broadcast("THINK_END", {"agent_id": agent.id})

    async def _broadcast(self, event_type: str, payload: dict) -> None:
        event = {
            "type": event_type,
            "session_id": self._session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        await self._broadcast_manager.broadcast(self._session_id, event)
