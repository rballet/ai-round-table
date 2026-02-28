from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from engine.agent_runner import AgentRunner
from engine.broadcast_manager import BroadcastManager
from engine.context import AgentContext, ContextBundle
from engine.moderator import ModeratorEngine, ModeratorState, QueueCandidate
from engine.queue_manager import QueueManager
from llm.client import LLMClient
from models.agent import Agent
from models.session import Session
from services import argument_service, thought_service


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
            priority_weights = {}
            if isinstance(config, dict):
                priority_weights = config.get("priority_weights", {}) or {}

        moderator = ModeratorEngine(priority_weights=priority_weights)
        moderator_state = ModeratorState(total_turns_elapsed=0)
        queue_manager = QueueManager(
            session_id=self._session_id,
            session_factory=self._session_factory,
        )

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
        await self._phase_init_queue(
            participants=participants,
            queue_manager=queue_manager,
            moderator=moderator,
            moderator_state=moderator_state,
        )
        await self._phase_single_argue_turn(
            topic=topic,
            prompt=prompt,
            supporting_context=supporting_context,
            participants=participants,
            queue_manager=queue_manager,
            moderator=moderator,
            moderator_state=moderator_state,
            config=config,
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

    async def _phase_init_queue(
        self,
        *,
        participants: list[AgentContext],
        queue_manager: QueueManager,
        moderator: ModeratorEngine,
        moderator_state: ModeratorState,
    ) -> None:
        for agent in participants:
            score = moderator.compute_priority_score(
                QueueCandidate(
                    agent_id=agent.id,
                    novelty_tier="first_argument",
                    role=agent.role,
                    justification="Initial speaking turn",
                ),
                moderator_state,
            )
            await queue_manager.push(
                agent_id=agent.id,
                agent_name=agent.display_name,
                novelty_tier="first_argument",
                priority_score=score,
                justification="Initial speaking turn",
            )
        await self._broadcast_queue_snapshot(queue_manager)

    async def _phase_single_argue_turn(
        self,
        *,
        topic: str,
        prompt: str,
        supporting_context: str | None,
        participants: list[AgentContext],
        queue_manager: QueueManager,
        moderator: ModeratorEngine,
        moderator_state: ModeratorState,
        config: dict,
    ) -> None:
        queued_agent = await queue_manager.pop()
        if queued_agent is None:
            return

        participants_by_id = {agent.id: agent for agent in participants}
        speaker = participants_by_id.get(queued_agent.agent_id)
        if speaker is None:
            return

        turn_index = moderator_state.total_turns_elapsed + 1
        round_index = 1

        await self._emit_event(
            "TOKEN_GRANTED",
            {
                "agent_id": speaker.id,
                "round_index": round_index,
                "turn_index": turn_index,
            },
        )

        async with self._session_factory() as db:
            runner = AgentRunner(
                session_id=self._session_id,
                db=db,
                llm_client=self._llm_client,
                broadcast_manager=self._broadcast_manager,
            )
            latest_thought = await thought_service.get_latest_thought(
                db,
                session_id=self._session_id,
                agent_id=speaker.id,
            )
            transcript = await argument_service.list_arguments_for_session(
                db,
                session_id=self._session_id,
            )
            context_bundle = ContextBundle(
                topic=topic,
                prompt=prompt,
                supporting_context=supporting_context,
                agent=speaker,
                current_thought=(
                    latest_thought.content if latest_thought is not None else None
                ),
                transcript=transcript,
                round_index=round_index,
                turn_index=turn_index,
            )
            argument = await runner.argue(speaker, context_bundle)

        await self._emit_event(
            "ARGUMENT_POSTED",
            {
                "argument": {
                    "id": argument.id,
                    "agent_id": speaker.id,
                    "agent_name": speaker.display_name,
                    "round_index": round_index,
                    "turn_index": turn_index,
                    "content": argument.content,
                }
            },
        )
        moderator_state.total_turns_elapsed = turn_index
        moderator_state.last_turn_by_agent[speaker.id] = turn_index
        await self._broadcast_queue_snapshot(queue_manager)

        # Update & decide phases follow every argue turn.
        await self._phase_update_all(
            active_agent_id=speaker.id,
            topic=topic,
            prompt=prompt,
            supporting_context=supporting_context,
            participants=participants,
            round_index=round_index,
            turn_index=turn_index,
            config=config,
        )
        await self._phase_decide_all(
            active_agent_id=speaker.id,
            topic=topic,
            prompt=prompt,
            supporting_context=supporting_context,
            participants=participants,
            queue_manager=queue_manager,
            moderator=moderator,
            moderator_state=moderator_state,
            round_index=round_index,
            turn_index=turn_index,
        )

    async def _phase_update_all(
        self,
        *,
        active_agent_id: str,
        topic: str,
        prompt: str,
        supporting_context: str | None,
        participants: list[AgentContext],
        round_index: int,
        turn_index: int,
        config: dict,
    ) -> None:
        """Update private thoughts for all non-active participants in parallel."""
        others = [a for a in participants if a.id != active_agent_id]
        thought_inspector_enabled = bool(
            config.get("thought_inspector_enabled", False)
            if isinstance(config, dict)
            else False
        )

        async def _update_one(agent: AgentContext) -> None:
            try:
                await self._emit_event("UPDATE_START", {"agent_id": agent.id})
                async with self._session_factory() as db:
                    runner = AgentRunner(
                        session_id=self._session_id,
                        db=db,
                        llm_client=self._llm_client,
                        broadcast_manager=self._broadcast_manager,
                    )
                    latest_thought = await thought_service.get_latest_thought(
                        db,
                        session_id=self._session_id,
                        agent_id=agent.id,
                    )
                    transcript = await argument_service.list_arguments_for_session(
                        db,
                        session_id=self._session_id,
                    )
                    context_bundle = ContextBundle(
                        topic=topic,
                        prompt=prompt,
                        supporting_context=supporting_context,
                        agent=agent,
                        current_thought=(
                            latest_thought.content if latest_thought is not None else None
                        ),
                        transcript=transcript,
                        round_index=round_index,
                        turn_index=turn_index,
                    )
                    updated_thought = await runner.update(agent, context_bundle)
                await self._emit_event("UPDATE_END", {"agent_id": agent.id})
                if thought_inspector_enabled:
                    await self._emit_event(
                        "THOUGHT_UPDATED",
                        {
                            "thought": {
                                "id": updated_thought.id,
                                "agent_id": agent.id,
                                "version": updated_thought.version,
                                "content": updated_thought.content,
                            },
                        },
                    )
            except Exception:
                # Do not crash the gather if one agent update fails.
                await self._emit_event("UPDATE_END", {"agent_id": agent.id})

        await asyncio.gather(*[_update_one(agent) for agent in others])

    async def _phase_decide_all(
        self,
        *,
        active_agent_id: str,
        topic: str,
        prompt: str,
        supporting_context: str | None,
        participants: list[AgentContext],
        queue_manager: QueueManager,
        moderator: ModeratorEngine,
        moderator_state: ModeratorState,
        round_index: int,
        turn_index: int,
    ) -> None:
        """Run decide for all non-active participants; push to queue if they request token."""
        others = [a for a in participants if a.id != active_agent_id]

        async def _decide_one(agent: AgentContext) -> None:
            try:
                async with self._session_factory() as db:
                    runner = AgentRunner(
                        session_id=self._session_id,
                        db=db,
                        llm_client=self._llm_client,
                        broadcast_manager=self._broadcast_manager,
                    )
                    latest_thought = await thought_service.get_latest_thought(
                        db,
                        session_id=self._session_id,
                        agent_id=agent.id,
                    )
                    transcript = await argument_service.list_arguments_for_session(
                        db,
                        session_id=self._session_id,
                    )
                    context_bundle = ContextBundle(
                        topic=topic,
                        prompt=prompt,
                        supporting_context=supporting_context,
                        agent=agent,
                        current_thought=(
                            latest_thought.content if latest_thought is not None else None
                        ),
                        transcript=transcript,
                        round_index=round_index,
                        turn_index=turn_index,
                    )
                    decide_result = await runner.decide(agent, context_bundle)

                if decide_result.request_token:
                    candidate = QueueCandidate(
                        agent_id=agent.id,
                        novelty_tier=decide_result.novelty_tier,
                        role=agent.role,
                        justification=decide_result.justification,
                    )
                    priority_score = moderator.compute_priority_score(
                        candidate, moderator_state
                    )
                    await queue_manager.push(
                        agent_id=agent.id,
                        agent_name=agent.display_name,
                        novelty_tier=decide_result.novelty_tier,
                        priority_score=priority_score,
                        justification=decide_result.justification,
                    )
                    snapshot = await queue_manager.snapshot()
                    position_in_queue = next(
                        (item.position for item in snapshot if item.agent_id == agent.id),
                        1,
                    )
                    await self._emit_event(
                        "TOKEN_REQUEST",
                        {
                            "agent_id": agent.id,
                            "novelty_tier": decide_result.novelty_tier,
                            "priority_score": priority_score,
                            "position_in_queue": position_in_queue,
                        },
                    )
            except Exception:
                # Do not crash the gather if one agent decide fails.
                pass

        await asyncio.gather(*[_decide_one(agent) for agent in others])
        await self._broadcast_queue_snapshot(queue_manager)

    async def _broadcast_queue_snapshot(self, queue_manager: QueueManager) -> None:
        snapshot = await queue_manager.snapshot()
        await self._emit_event(
            "QUEUE_UPDATED",
            {
                "queue": [
                    {
                        "agent_id": item.agent_id,
                        "agent_name": item.agent_name,
                        "priority_score": item.priority_score,
                        "novelty_tier": item.novelty_tier,
                        "justification": item.justification,
                        "position": item.position,
                    }
                    for item in snapshot
                ]
            },
        )

    async def _broadcast_session_start(
        self,
        *,
        topic: str,
        prompt: str,
        config: dict,
        agents: list[AgentContext],
    ) -> None:
        payload = {
            "topic": topic,
            "prompt": prompt,
            "config": config,
            "agents": [
                {
                    "id": agent.id,
                    "session_id": self._session_id,
                    "display_name": agent.display_name,
                    "persona_description": agent.persona_description,
                    "expertise": agent.expertise,
                    "llm_provider": agent.llm_provider,
                    "llm_model": agent.llm_model,
                    "role": agent.role,
                }
                for agent in agents
            ],
        }
        await self._emit_event("SESSION_START", payload)

    async def _emit_event(self, event_type: str, payload: dict) -> None:
        event = {
            "type": event_type,
            "session_id": self._session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        await self._broadcast_manager.broadcast(self._session_id, event)

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
