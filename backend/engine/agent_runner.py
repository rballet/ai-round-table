from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.prompt_logger import log_prompt
from engine.broadcast_manager import BroadcastManager
from engine.context import AgentContext, ContextBundle
from engine.utils import strip_code_fences
from llm.client import LLMClient
from llm.prompts.argue import build_argue_messages
from llm.prompts.decide import build_decide_messages
from llm.prompts.scribe import build_scribe_messages
from llm.prompts.think import build_think_messages
from llm.prompts.update import build_update_messages
from models.argument import Argument
from models.summary import Summary
from models.thought import Thought
from services import argument_service, thought_service, session_service

logger = logging.getLogger(__name__)


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
            messages = build_think_messages(context_bundle)
            completion = await self._llm_client.complete(
                provider=agent.llm_provider,
                model=agent.llm_model,
                messages=messages,
                config=agent.llm_config or {},
            )
            log_prompt(
                session_id=self._session_id,
                phase="think",
                agent_name=agent.display_name,
                agent_role=agent.role,
                round_index=context_bundle.round_index,
                provider=agent.llm_provider,
                model=agent.llm_model,
                messages=messages,
                response=completion,
                log_dir=settings.LOG_DIR,
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
        messages = build_argue_messages(context_bundle)
        completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            config=agent.llm_config or {},
        )
        log_prompt(
            session_id=self._session_id,
            phase="argue",
            agent_name=agent.display_name,
            agent_role=agent.role,
            round_index=context_bundle.round_index,
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            response=completion,
            log_dir=settings.LOG_DIR,
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
        messages = build_update_messages(context_bundle)
        completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            config=agent.llm_config or {},
        )
        log_prompt(
            session_id=self._session_id,
            phase="update",
            agent_name=agent.display_name,
            agent_role=agent.role,
            round_index=context_bundle.round_index,
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            response=completion,
            log_dir=settings.LOG_DIR,
        )
        return await thought_service.save_thought(
            self._db,
            session_id=self._session_id,
            agent_id=agent.id,
            content=completion,
        )

    async def scribe(
        self,
        agent: AgentContext,
        context_bundle: ContextBundle,
        termination_reason: str,
    ) -> Summary:
        messages = build_scribe_messages(context_bundle)
        completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            config=agent.llm_config or {},
        )
        log_prompt(
            session_id=self._session_id,
            phase="scribe",
            agent_name=agent.display_name,
            agent_role=agent.role,
            round_index=None,
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=messages,
            response=completion,
            log_dir=settings.LOG_DIR,
        )
        return await session_service.save_summary(
            self._db,
            session_id=self._session_id,
            scribe_agent_id=agent.id,
            content=completion,
            termination_reason=termination_reason,
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
            log_prompt(
                session_id=self._session_id,
                phase="decide",
                agent_name=agent.display_name,
                agent_role=agent.role,
                round_index=context_bundle.round_index,
                provider=agent.llm_provider,
                model=agent.llm_model,
                messages=messages,
                response=completion,
                log_dir=settings.LOG_DIR,
            )
            return parsed

        retry_messages = messages + [
            {"role": "assistant", "content": completion},
            {
                "role": "user",
                "content": (
                    "Your previous response was not valid JSON. "
                    "Respond with ONLY valid JSON matching the schema above. "
                    "No markdown fences, no preamble."
                ),
            },
        ]
        retry_completion = await self._llm_client.complete(
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=retry_messages,
            config=agent.llm_config or {},
        )
        retry_parsed = self._parse_decide_response(retry_completion)
        if retry_parsed is None:
            logger.warning(
                "Decide parse failed twice for agent %s in session %s; using safe fallback.",
                agent.display_name,
                self._session_id,
            )
            return DecideResult(
                request_token=False,
                novelty_tier="reinforcement",
                justification=None,
            )
        log_prompt(
            session_id=self._session_id,
            phase="decide (retry)",
            agent_name=agent.display_name,
            agent_role=agent.role,
            round_index=context_bundle.round_index,
            provider=agent.llm_provider,
            model=agent.llm_model,
            messages=retry_messages,
            response=retry_completion,
            log_dir=settings.LOG_DIR,
        )
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
            payload = json.loads(strip_code_fences(raw))
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
