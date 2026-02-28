---
name: architecture
description: >
  Module map and key design decisions for AI Round Table. Auto-loaded when navigating
  the codebase, adding new modules, or making architectural decisions.
---

## Backend Module Ownership

| Module | Owns |
|---|---|
| `engine/orchestrator.py` | Main async loop, phase sequencing, termination |
| `engine/moderator.py` | Priority scoring, convergence evaluation, claim registry |
| `engine/agent_runner.py` | LLM call dispatch per phase, returns strings only |
| `engine/queue_manager.py` | `asyncio.PriorityQueue` wrapper — push/pop/snapshot |
| `engine/broadcast_manager.py` | In-process WS fan-out, `session_id → connections` dict |
| `llm/client.py` | Provider resolution, unified `complete()` interface |
| `llm/prompts/` | One file per phase: think, update, argue, decide, moderator, scribe |
| `services/` | All SQLAlchemy DB operations — no DB calls outside `services/` |
| `routers/` | HTTP/WS layer only — no business logic |

## Frontend Module Ownership

| Module | Owns |
|---|---|
| `store/sessionStore.ts` | All WS-driven state mutations |
| `hooks/useWebSocket.ts` | WS connection, raw event dispatch to store |
| `hooks/useSession.ts` | REST calls, initial session load |
| `lib/api.ts` | All fetch calls — typed, no raw fetch elsewhere |
| `lib/mock/` | MSW + WS Simulator — activated by `NEXT_PUBLIC_USE_MOCK=true` |

## Critical Invariants
1. `AgentRunner` is stateless — takes inputs, returns a string, no side effects
2. `ModeratorEngine` is the ONLY place priority scoring happens
3. `QueueEntry` is always written to SQLite even though the live queue is in-memory
4. WS events are the source of truth during live sessions (not REST polling)
5. `shared/types/` is the source of truth — Pydantic and MSW derive from it

## Key Design Decisions

**Async-first:** All LLM calls, DB writes, WS broadcasts use `async/await`. Parallel Think and Update phases use `asyncio.gather()`.

**JSON-structured phases:** Decide and Moderator prompts return JSON. Parsing is wrapped in retry logic (max 2 retries).

**In-process only (v1):** Orchestrators held in `dict[session_id, SessionOrchestrator]` on the FastAPI app lifespan. No Redis, no external queue. Server restart loses in-flight sessions (acceptable for local-first use).

**SQLite WAL mode:** Supports concurrent reads during writes — important since the frontend polls transcript while the orchestrator writes.

**Mock-first frontend dev:** `WSSimulator` replaces the real WebSocket. The entire live UI can be built without a running backend.

**LLM abstraction:** Adding a new provider = one file in `llm/providers/` + register in `_providers` dict. Nothing else changes.

## Orchestration Loop (simplified)
```
await _phase_think(prompt, context)      # parallel, all agents
await _init_queue()                      # all agents submit initial token request
while not moderator.should_terminate():
    agent = await moderator.next_agent()
    await _phase_argue(agent)            # one agent argues
    await _phase_update_all(agent)       # parallel update thoughts
    await _phase_decide_all(agent)       # parallel decide → re-queue
await _phase_scribe()                    # summarise
```
