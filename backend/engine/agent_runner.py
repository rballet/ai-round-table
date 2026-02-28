from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from engine.broadcast_manager import BroadcastManager
from engine.context import AgentContext, ContextBundle
from llm.client import LLMClient
from llm.prompts.argue import build_argue_messages
from llm.prompts.decide import build_decide_messages
from llm.prompts.think import build_think_messages
from llm.prompts.update import build_update_messages
from models.argument import Argument
from models.thought import Thought
from services import argument_service, thought_service


@dataclass(frozen=True)
class DecideResult:
    request_token: bool
    novelty_tier: str
    justification: str | None


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

    async def argue(
        self,
        agent: AgentContext,
        context_bundle: ContextBundle,
    ) -> Argument:
        completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=build_argue_messages(context_bundle),
            config=agent.llm_config or {},
        )
        return await argument_service.save_argument(
            self._db,
            session_id=self._session_id,
            agent_id=agent.id,
            round_index=context_bundle.round_index,
            turn_index=context_bundle.turn_index,
            content=completion,
        )

    async def update(
        self,
        agent: AgentContext,
        context_bundle: ContextBundle,
    ) -> Thought:
        """Update an agent's private thought after hearing another agent's argument.

        Saves a new version of the thought to the DB and returns it.
        Broadcasting is the orchestrator's responsibility.
        """
        completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=build_update_messages(context_bundle),
            config=agent.llm_config or {},
        )
        return await thought_service.save_thought(
            self._db,
            session_id=self._session_id,
            agent_id=agent.id,
            content=completion,
        )

    async def decide(
        self,
        agent: AgentContext,
        context_bundle: ContextBundle,
    ) -> DecideResult:
        messages = build_decide_messages(context_bundle)
        completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            config=agent.llm_config or {},
        )
        parsed = self._parse_decide_response(completion)
        if parsed is not None:
            return parsed

        retry_messages = messages + [
            {
                "role": "user",
                "content": (
                    "Your previous response was not valid JSON. "
                    "Respond with ONLY valid JSON."
                ),
            }
        ]
        retry_completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=retry_messages,
            config=agent.llm_config or {},
        )
        retry_parsed = self._parse_decide_response(retry_completion)
        if retry_parsed is None:
            raise ValueError("Decide response was not valid JSON.")
        return retry_parsed

    async def _broadcast(self, event_type: str, payload: dict) -> None:
        event = {
            "type": event_type,
            "session_id": self._session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        await self._broadcast_manager.broadcast(self._session_id, event)

    @staticmethod
    def _parse_decide_response(raw: str) -> DecideResult | None:
        try:
            payload = json.loads(raw.strip())
        except json.JSONDecodeError:
            return None

        request_token = bool(payload.get("request_token", False))
        novelty_tier = str(payload.get("novelty_tier", "reinforcement"))
        justification = payload.get("justification")
        if justification is not None:
            justification = str(justification).strip() or None

        return DecideResult(
            request_token=request_token,
            novelty_tier=novelty_tier,
            justification=justification,
        )
