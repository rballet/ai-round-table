from __future__ import annotations

import asyncio
from dataclasses import dataclass
from itertools import count

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from services import queue_service


@dataclass(frozen=True)
class QueueItem:
    entry_id: str
    agent_id: str
    agent_name: str | None
    novelty_tier: str
    priority_score: float
    justification: str | None


@dataclass(frozen=True)
class QueueSnapshotItem:
    agent_id: str
    agent_name: str | None
    priority_score: float
    novelty_tier: str
    justification: str | None
    position: int


class QueueManager:
    def __init__(
        self,
        *,
        session_id: str,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._session_id = session_id
        self._session_factory = session_factory
        self._queue: asyncio.PriorityQueue[tuple[float, int, QueueItem]] = (
            asyncio.PriorityQueue()
        )
        self._counter = count()
        self._active_items: dict[str, tuple[float, int, QueueItem]] = {}

    async def push(
        self,
        *,
        agent_id: str,
        agent_name: str | None,
        novelty_tier: str,
        priority_score: float,
        justification: str | None,
    ) -> QueueItem:
        # Remove any existing active entry for the same agent to avoid duplicates
        existing_entry_id = next(
            (item.entry_id for _, _, item in self._active_items.values() if item.agent_id == agent_id),
            None
        )
        if existing_entry_id:
            self._active_items.pop(existing_entry_id, None)
            async with self._session_factory() as db:
                await queue_service.mark_queue_entry_processed(
                    db, queue_entry_id=existing_entry_id
                )

        async with self._session_factory() as db:
            persisted = await queue_service.create_queue_entry(
                db,
                session_id=self._session_id,
                agent_id=agent_id,
                novelty_tier=novelty_tier,
                priority_score=priority_score,
                justification=justification,
            )

        queue_item = QueueItem(
            entry_id=persisted.id,
            agent_id=agent_id,
            agent_name=agent_name,
            novelty_tier=novelty_tier,
            priority_score=priority_score,
            justification=justification,
        )
        sort_key = -priority_score
        sequence = next(self._counter)
        record = (sort_key, sequence, queue_item)
        self._active_items[queue_item.entry_id] = record
        await self._queue.put(record)
        return queue_item

    async def pop(self) -> QueueItem | None:
        while True:
            try:
                _, _, queue_item = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                return None

            record = self._active_items.pop(queue_item.entry_id, None)
            if record is None:
                continue

            async with self._session_factory() as db:
                await queue_service.mark_queue_entry_processed(
                    db, queue_entry_id=queue_item.entry_id
                )
            return queue_item

    async def snapshot(self) -> list[QueueSnapshotItem]:
        ordered = sorted(
            self._active_items.values(),
            key=lambda item: (item[0], item[1]),
        )
        return [
            QueueSnapshotItem(
                agent_id=queue_item.agent_id,
                agent_name=queue_item.agent_name,
                priority_score=queue_item.priority_score,
                novelty_tier=queue_item.novelty_tier,
                justification=queue_item.justification,
                position=index,
            )
            for index, (_, _, queue_item) in enumerate(ordered, start=1)
        ]

    def is_empty(self) -> bool:
        return len(self._active_items) == 0
