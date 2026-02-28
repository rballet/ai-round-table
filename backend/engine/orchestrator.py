from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from engine.agent_runner import AgentRunner
from engine.broadcast_manager import BroadcastManager
from engine.context import AgentContext, ContextBundle
from llm.client import LLMClient
from models.agent import Agent
from models.session import Session


class SessionOrchestrator:
    def __init__(
        self,
        *,
        session_id: str,
        session_factory: async_sessionmaker[AsyncSession],
        broadcast_manager: BroadcastManager,
        llm_client: LLMClient | None = None,
    ) -> None:
        self._session_id = session_id
        self._session_factory = session_factory
        self._broadcast_manager = broadcast_manager
        self._llm_client = llm_client or LLMClient()

    async def run(self, prompt: str) -> None:
        async with self._session_factory() as db:
            result = await db.execute(
                select(Session)
                .where(Session.id == self._session_id)
                .options(selectinload(Session.agents))
            )
            session = result.scalar_one_or_none()
            if session is None:
                return

            session.status = "running"
            await db.commit()

            topic = session.topic
            supporting_context = session.supporting_context
            config = session.config
            agents = [self._to_agent_context(agent) for agent in session.agents]
            participants = [a for a in agents if a.role == "participant"]

        await self._broadcast_session_start(
            topic=topic,
            prompt=prompt,
            config=config,
            agents=agents,
        )
        await self._phase_think(
            topic=topic,
            prompt=prompt,
            supporting_context=supporting_context,
            participants=participants,
        )

    async def _phase_think(
        self,
        *,
        topic: str,
        prompt: str,
        supporting_context: str | None,
        participants: list[AgentContext],
    ) -> None:
        await asyncio.gather(
            *[
                self._run_agent_think(
                    agent=agent,
                    topic=topic,
                    prompt=prompt,
                    supporting_context=supporting_context,
                )
                for agent in participants
            ]
        )

    async def _run_agent_think(
        self,
        *,
        agent: AgentContext,
        topic: str,
        prompt: str,
        supporting_context: str | None,
    ) -> None:
        context_bundle = ContextBundle(
            topic=topic,
            prompt=prompt,
            supporting_context=supporting_context,
            agent=agent,
            round_index=1,
            turn_index=0,
        )
        async with self._session_factory() as db:
            runner = AgentRunner(
                session_id=self._session_id,
                db=db,
                llm_client=self._llm_client,
                broadcast_manager=self._broadcast_manager,
            )
            await runner.think(agent, context_bundle)

    async def _broadcast_session_start(
        self,
        *,
        topic: str,
        prompt: str,
        config: dict,
        agents: list[AgentContext],
    ) -> None:
        payload = {
            "type": "SESSION_START",
            "session_id": self._session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "topic": topic,
            "prompt": prompt,
            "config": config,
            "agents": [
                {
                    "id": agent.id,
                    "display_name": agent.display_name,
                    "role": agent.role,
                }
                for agent in agents
            ],
        }
        await self._broadcast_manager.broadcast(self._session_id, payload)

    @staticmethod
    def _to_agent_context(agent: Agent) -> AgentContext:
        return AgentContext(
            id=agent.id,
            display_name=agent.display_name,
            persona_description=agent.persona_description,
            expertise=agent.expertise,
            llm_provider=agent.llm_provider,
            llm_model=agent.llm_model,
            llm_config=agent.llm_config,
            role=agent.role,
        )
