# AI Round Table — Project Context

## Stack
- Backend: FastAPI + SQLAlchemy (async) + aiosqlite + SQLite
- Frontend: Next.js (App Router) + Zustand + MSW + Tailwind + Framer Motion
- Shared: TypeScript types in `shared/types/` (source of truth for API contract)

## Project Structure
```
ai-roundtable/
├── backend/
│   ├── engine/         # orchestrator, moderator, agent_runner, queue_manager, broadcast_manager
│   ├── llm/            # client.py, providers/, prompts/
│   ├── models/         # SQLAlchemy ORM
│   ├── schemas/        # Pydantic (mirrors shared/types/)
│   ├── routers/        # HTTP/WS layer only
│   └── services/       # All DB operations
├── frontend/
│   ├── app/            # Next.js App Router pages
│   ├── components/     # table/, feed/, setup/, controls/, ui/
│   ├── hooks/          # useSession, useWebSocket, useTableLayout, useAgentStatus
│   ├── lib/            # api.ts, mock/ (MSW + WS Simulator)
│   └── store/          # sessionStore.ts (Zustand)
└── shared/types/       # session.ts, agent.ts, events.ts, api.ts
```

## Architecture Decisions
- One `SessionOrchestrator` per session, held in-process (`dict[session_id, orchestrator]`)
- Live token queue: `asyncio.PriorityQueue` — NOT Redis
- WebSocket fan-out: in-process `BroadcastManager` — NOT Redis pub/sub
- SQLite in WAL mode via SQLAlchemy async engine
- All LLM calls go through `LLMClient.complete()` — never call provider SDKs directly
- `AgentRunner` is stateless — takes inputs, returns a string, no side effects
- `ModeratorEngine` is the ONLY place priority scoring happens
- Pydantic schemas in `backend/schemas/` must mirror `shared/types/` exactly

## Parallel Development Rule
Backend and frontend are independent tracks. The mock layer (MSW + WS Simulator) is the contract boundary for frontend dev.

Any change to `shared/types/` MUST be followed immediately by:
1. Updating `backend/schemas/` (Pydantic)
2. Updating `frontend/lib/mock/handlers.ts` (MSW)
3. Updating `frontend/lib/mock/simulator.ts` (if a WS event changed)

**Never skip this. Use `/sync-contract` to automate it.**

## LLM Prompt Rules
- All prompts are in `backend/llm/prompts/` as Python functions
- Prompts take a `ContextBundle` and return `list[Message]`
- Decide and Moderator prompts must return parseable JSON — always wrap in retry logic

## Code Style
- Backend: async/await everywhere, no sync DB calls, type hints on all functions
- Frontend: TypeScript strict mode, no `any`, Zustand for session state only
- Tests: pytest + pytest-asyncio (backend), Playwright with `USE_MOCK=true` (frontend e2e)

## Key Invariants
1. `AgentRunner` is stateless — inputs in, string out
2. `ModeratorEngine` is the ONLY place priority scoring happens
3. `QueueEntry` is always written to SQLite even though the live queue is in-memory
4. WS events are the source of truth during live sessions (not REST polling)
5. `shared/types/` is the source of truth — Pydantic and MSW derive from it

## Spec References
- PRD: `PRD.md`
- Technical design: `ARCHITECTURE.md`
- Task plan: `TASK_PLAN.md`
