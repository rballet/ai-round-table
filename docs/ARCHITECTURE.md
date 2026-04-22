# AI Round Table — Technical Design

**Version:** 0.2
**Status:** Current
**Author:** Raphael — Dipolo AI
**Date:** February 2026 (updated March 2026)
**Depends on:** PRD v0.1

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [API Contract](#4-api-contract)
5. [WebSocket Event Schema](#5-websocket-event-schema)
6. [Data Flows](#6-data-flows)
7. [Prompt Architecture](#7-prompt-architecture)
8. [Key Technical Decisions](#8-key-technical-decisions)
9. [Environment & Configuration](#9-environment--configuration)
10. [Dependencies](#10-dependencies)

---

## 1. Project Structure

Monorepo with two top-level packages. Shared types live in a third package that both consume — this is the foundation for parallel development with confidence.

```
ai-roundtable/
├── backend/                    # FastAPI application
├── frontend/                   # Next.js application
├── shared/                     # Shared TypeScript types (API contract)
│   └── types/
│       ├── session.ts
│       ├── agent.ts
│       ├── events.ts           # WebSocket event types
│       └── api.ts              # REST request/response types
├── .env.example
├── docker-compose.yml          # Optional: run both services together
└── README.md
```

The `shared/types` package is the contract boundary. The frontend imports from it directly. The backend has a mirrored `schemas/` module in Pydantic. Any API change requires updating both — this is intentional friction that prevents drift.

---

## 2. Backend Architecture

### 2.1 Module Structure

```
backend/
├── main.py                     # FastAPI app entry point, router registration, lifespan
├── core/
│   ├── config.py               # Settings via pydantic-settings
│   ├── database.py             # SQLAlchemy async engine + session factory
│   └── prompt_logger.py        # Per-session prompt logging utility
├── models/                     # SQLAlchemy ORM models
│   ├── session.py
│   ├── agent.py
│   ├── thought.py
│   ├── argument.py
│   ├── queue_entry.py
│   ├── moderator_state.py
│   ├── summary.py
│   ├── error_event.py          # LLM/orchestrator error tracking (SPEC-302)
│   ├── agent_preset.py         # Reusable agent personas (SPEC-401)
│   └── session_template.py     # Saved session configs (SPEC-402)
├── schemas/                    # Pydantic request/response schemas
│   ├── session.py
│   ├── agent.py
│   ├── events.py               # WebSocket event payloads
│   └── api.py
├── routers/
│   ├── sessions.py             # REST: session lifecycle + templates
│   ├── agents.py               # REST: agent preset management
│   └── websocket.py            # WS: /sessions/{id}/stream
├── engine/
│   ├── orchestrator.py         # SessionOrchestrator: main async loop
│   ├── agent_runner.py         # AgentRunner: stateless LLM call dispatcher per phase
│   ├── moderator.py            # ModeratorEngine: queue, convergence, state
│   ├── queue_manager.py        # QueueManager: asyncio.PriorityQueue wrapper
│   ├── broadcast_manager.py    # BroadcastManager: in-process WS fan-out
│   ├── context.py              # AgentContext + ContextBundle dataclasses
│   └── utils.py                # Shared utilities (e.g. strip_code_fences)
├── llm/
│   ├── client.py               # Unified async LLM client (provider abstraction)
│   ├── errors.py               # LLM-specific exceptions
│   ├── types.py                # Message + LLMConfig TypedDicts
│   ├── providers/
│   │   ├── base.py             # Abstract base: complete(messages) → str
│   │   ├── openai.py
│   │   ├── anthropic.py
│   │   ├── gemini.py           # Google GenAI SDK
│   │   ├── ollama.py           # Local Ollama via OpenAI-compatible API
│   │   └── mock.py             # Deterministic mock for testing
│   └── prompts/
│       ├── think.py
│       ├── update.py
│       ├── argue.py
│       ├── decide.py
│       ├── moderator.py
│       └── scribe.py
├── services/
│   ├── session_service.py      # DB operations for sessions + transcript/thoughts/queue/summary
│   ├── agent_service.py
│   ├── thought_service.py
│   ├── argument_service.py
│   ├── queue_service.py        # QueueEntry audit log writes
│   ├── error_service.py        # Error event persistence (SPEC-302)
│   ├── preset_service.py       # Agent preset CRUD + system preset seeding (SPEC-401)
│   └── template_service.py     # Session template CRUD (SPEC-402)
└── alembic/                    # DB migrations
    └── versions/
```

### 2.2 Engine Layer Design

The engine is the core of the system. Three classes coordinate the discussion loop. Feature milestones may ship a subset of phases before the full loop is complete.

**`SessionOrchestrator`** — owns the main async loop for one session. Created per session on `POST /sessions/{id}/start`. Runs until convergence or cap.

```python
class SessionOrchestrator:
    session_id: str
    moderator: ModeratorEngine
    agent_runner: AgentRunner
    broadcast: BroadcastManager

    async def run(self, prompt: str, context: str) -> None:
        await self._phase_think(prompt, context)     # parallel think
        await self._init_queue()                     # all agents submit initial request
        while not await self.moderator.should_terminate():
            agent = await self.moderator.next_agent()
            await self._phase_argue(agent)           # argue
            await self._phase_update_all(agent)      # parallel update
            await self._phase_decide_all(agent)      # parallel decide → re-queue
        await self._phase_scribe()
```

**`ModeratorEngine`** — stateful. Owns the `QueueManager`, the claim registry, alignment map, and convergence logic. The only place where priority scoring happens.

**`AgentRunner`** — phase executor. Given an agent and a context bundle, it builds phase prompts, calls the right LLM provider, persists phase outputs via services (e.g., `Thought`, `Argument`), and emits phase WS events.

### 2.3 QueueManager

```python
class QueueManager:
    # asyncio.PriorityQueue stores (score, entry)
    # Lower score = higher priority (PriorityQueue is a min-heap)
    # Score is inverted: priority_score * -1 before insertion

    async def push(self, entry: QueueEntry, score: float) -> None
    async def pop(self) -> QueueEntry
    async def snapshot(self) -> list[QueueEntry]   # for UI / API
    def is_empty(self) -> bool
```

`QueueEntry` records are always persisted to SQLite via `queue_service` for the audit log, regardless of whether the queue is in-memory.

### 2.4 BroadcastManager

```python
class BroadcastManager:
    _connections: dict[str, set[WebSocket]]  # session_id → connections

    async def connect(self, session_id: str, ws: WebSocket) -> None
    async def disconnect(self, session_id: str, ws: WebSocket) -> None
    async def broadcast(self, session_id: str, event: BaseEvent) -> None
```

Single instance, registered as a FastAPI app-level dependency on startup.

### 2.5 LLM Client Abstraction

All LLM calls go through a single `LLMClient.complete()` interface. Provider is resolved at runtime from the agent's `llm_provider` field.

```python
class BaseLLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[Message], config: dict) -> str:
        ...

class LLMClient:
    _providers: dict[str, BaseLLMProvider] = {
        "openai": OpenAIProvider(),
        "anthropic": AnthropicProvider(),
        "gemini": GeminiProvider(),
        "ollama": OllamaProvider(),
        "mock": MockProvider(),
    }

    async def complete(
        self,
        provider: str,
        model: str,
        messages: list[Message],
        config: dict
    ) -> str:
        return await self._providers[provider].complete(messages, config)
```

Adding a new provider = adding a file in `llm/providers/` and registering it in `_providers`. Nothing else changes.

---

## 3. Frontend Architecture

### 3.1 Module Structure

```
frontend/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── page.tsx                # Home: session list + search/filter + create new
│   │   ├── sessions/
│   │   │   ├── new/
│   │   │   │   └── page.tsx        # Session setup wizard (with TemplatePicker)
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Live round table view
│   │   └── layout.tsx
│   ├── components/
│   │   ├── table/
│   │   │   ├── RoundTable.tsx      # Main canvas/SVG table
│   │   │   ├── AgentSeat.tsx       # Individual agent avatar + status
│   │   │   ├── TokenChip.tsx       # Animated token
│   │   │   ├── QueuePanel.tsx      # Priority queue sidebar
│   │   │   └── ThoughtInspector.tsx # Expandable private thought panel (SPEC-301)
│   │   ├── feed/
│   │   │   ├── ArgumentFeed.tsx    # Scrollable argument list (auto-scroll, pause on user scroll)
│   │   │   ├── ArgumentBubble.tsx  # Single argument card (role badge + expand/collapse)
│   │   │   ├── SummaryPanel.tsx    # SESSION_END/SUMMARY_POSTED overlay with Markdown summary
│   │   │   └── ErrorNotification.tsx # Inline error display for ERROR events (SPEC-302)
│   │   ├── setup/
│   │   │   ├── Step1Topic.tsx      # Topic + supporting context input
│   │   │   ├── Step2Agents.tsx     # Agent lineup: add/remove/configure
│   │   │   ├── Step3Config.tsx     # Session config + "Save as template" (SPEC-402)
│   │   │   ├── AgentForm.tsx       # Per-agent: name, persona, model + "Save as preset" (SPEC-401)
│   │   │   ├── PresetPanel.tsx     # Persona picker with category filters + delete (SPEC-401)
│   │   │   └── TemplatePicker.tsx  # Template loader with optimistic delete (SPEC-402)
│   │   ├── controls/
│   │   │   └── SessionStatus.tsx   # Round counter, convergence meter, pause/resume/end
│   │   ├── history/
│   │   │   └── CompletedSessionView.tsx # Read-only transcript + summary + Markdown export (SPEC-303)
│   │   └── ui/                     # Shared primitives (StatusBadge, StepIndicator, Toast)
│   ├── hooks/
│   │   └── useWebSocket.ts         # WS connection + event dispatch to Zustand store
│   └── store/
│       └── sessionStore.ts         # Zustand: live session state + loadWizardFromTemplate
├── lib/                            # Utilities (not under src/)
│   ├── api.ts                      # Typed REST client (wraps fetch)
│   └── mock/
│       ├── handlers.ts             # MSW request handlers
│       ├── simulator.ts            # Fake WS event emitter for UI dev
│       ├── browser.ts              # MSW browser worker setup
│       └── MSWProvider.tsx         # React provider that activates MSW + simulator
└── public/                         # Static assets + MSW service worker
```

### 3.2 State Management

**Zustand** for live session state. Two slices:

```typescript
// Session slice — loaded once, updated on WS events
interface SessionState {
  session: Session | null
  agents: Agent[]
  arguments: Argument[]
  thoughts: Record<string, Thought>    // agent_id → latest thought
  queue: QueueEntry[]
  status: SessionStatus
  roundsElapsed: number
}

// UI slice — purely local, never synced to backend
interface UIState {
  selectedAgentId: string | null
  thoughtInspectorOpen: boolean
  isPaused: boolean
}
```

All WS events mutate `SessionState` directly. REST calls are used for initial load only. This means the frontend is event-sourced during a live session — the WS stream is the source of truth, not polling.

### 3.3 Mock Infrastructure

The mock layer is what enables parallel development. Two tools:

**MSW (Mock Service Worker)** — intercepts all `fetch` calls in development and returns fixture data. Configured in `lib/mock/handlers.ts`. Activated by `NEXT_PUBLIC_USE_MOCK=true` in `.env.local`.

**WS Simulator** — a fake WebSocket that emits pre-scripted event sequences on a timer. Used to develop the live table UI before the backend exists. Triggered by the same env flag.

```typescript
// lib/mock/simulator.ts
export class WSSimulator {
  start(sessionId: string, onEvent: (event: BaseEvent) => void): void {
    // Replays a scripted discussion sequence with configurable delays
    // Covers all event types: THINK_START, TOKEN_GRANTED, ARGUMENT_POSTED, etc.
  }
}
```

This means the entire live UI — token animation, argument feed, agent status changes, queue updates — can be built and tested without a running backend.

---

## 4. API Contract

All requests and responses use `application/json`. Auth is out of scope for v1 (local use).

---

### `POST /sessions`

Create a new session with full configuration.

**Request**
```json
{
  "topic": "Should we use microservices or a monolith for our new platform?",
  "supporting_context": "Our team has 4 engineers. Current stack is a Django monolith serving 50k MAU.",  // max 10000 chars
  "config": {
    "max_rounds": 3,
    "convergence_majority": 0.6,
    "priority_weights": {
      "recency": 0.4,
      "novelty": 0.5,
      "role": 0.1
    },
    "thought_inspector_enabled": true
  },
  "agents": [
    {
      "display_name": "Alex",
      "persona_description": "You are a pragmatic backend engineer who has migrated two systems from monolith to microservices. You are sceptical of hype and demand evidence.",
      "expertise": "Distributed systems, backend architecture, team scaling",
      "llm_provider": "anthropic",
      "llm_model": "claude-opus-4-7",
      "llm_config": { "temperature": 0.7, "max_tokens": 1000 },
      "role": "participant"
    },
    {
      "display_name": "Moderator",
      "persona_description": "You are a neutral discussion facilitator. You do not have opinions.",
      "expertise": "Facilitation",
      "llm_provider": "anthropic",
      "llm_model": "claude-sonnet-4-6",
      "llm_config": { "temperature": 0.2, "max_tokens": 500 },
      "role": "moderator"
    },
    {
      "display_name": "Scribe",
      "persona_description": "You are a precise technical writer. You summarise discussions without opinion.",
      "expertise": "Technical writing",
      "llm_provider": "openai",
      "llm_model": "gpt-5.4",
      "llm_config": { "temperature": 0.3, "max_tokens": 2000 },
      "role": "scribe"
    }
  ]
}
```

**Response `201`**
```json
{
  "id": "sess_abc123",
  "topic": "Should we use microservices or a monolith?",
  "status": "configured",
  "config": { ... },
  "agents": [
    {
      "id": "agt_001",
      "session_id": "sess_abc123",
      "display_name": "Alex",
      "role": "participant",
      "llm_provider": "anthropic",
      "llm_model": "claude-opus-4-7"
    }
  ],
  "created_at": "2026-02-15T10:00:00Z"
}
```

---

### `POST /sessions/{id}/start`

Submit the human prompt and begin the discussion. This triggers the full orchestration loop.

**Request**
```json
{
  "prompt": "Given our constraints, which approach gives us the best velocity over the next 18 months?"
}
```

**Response `202`**
```json
{
  "session_id": "sess_abc123",
  "status": "running"
}
```

The client should connect to the WebSocket stream before or immediately after calling this endpoint.

---

### `GET /sessions/{id}`

Get session metadata and current status.

**Response `200`**
```json
{
  "id": "sess_abc123",
  "topic": "...",
  "status": "running",  // configured | running | paused | ended
  "rounds_elapsed": 1,
  "config": { ... },
  "agents": [ ... ],
  "termination_reason": null,
  "created_at": "...",
  "ended_at": null
}
```

---

### `GET /sessions/{id}/transcript`

Full ordered list of public arguments.

**Response `200`**
```json
{
  "session_id": "sess_abc123",
  "arguments": [
    {
      "id": "arg_001",
      "agent_id": "agt_001",
      "agent_name": "Alex",
      "round_index": 1,
      "turn_index": 1,
      "content": "My argument...",
      "created_at": "..."
    }
  ]
}
```

---

### `GET /sessions/{id}/thoughts`

Latest private thought per agent (all versions available via `?agent_id=&version=`).

**Response `200`**
```json
{
  "session_id": "sess_abc123",
  "thoughts": [
    {
      "id": "tht_001",
      "agent_id": "agt_001",
      "agent_name": "Alex",
      "version": 3,
      "content": "...",
      "created_at": "..."
    }
  ]
}
```

---

### `GET /sessions/{id}/queue`

Current state of the priority queue.

**Response `200`**
```json
{
  "session_id": "sess_abc123",
  "queue": [
    {
      "agent_id": "agt_002",
      "agent_name": "Sam",
      "priority_score": 0.82,
      "novelty_tier": "new_information",
      "justification": "I have data on team velocity that contradicts the previous argument.",
      "position": 1
    }
  ]
}
```

---

### `POST /sessions/{id}/pause`
### `POST /sessions/{id}/resume`

No request body. Response `200 { "status": "paused" | "running" }`.

---

### `POST /sessions/{id}/end`

Force-terminate. Triggers Scribe immediately.

No request body. Response `202 { "status": "ending" }`.

---

### `GET /sessions/{id}/summary`

**Response `200`**
```json
{
  "id": "sum_001",
  "session_id": "sess_abc123",
  "termination_reason": "consensus",  // consensus | cap | host
  "content": "## Winning Argument\n\n...",
  "created_at": "..."
}
```

---

### `DELETE /sessions/{id}`

Delete a session and all associated data. Response `204`.

---

### `GET /sessions/{id}/errors`

Error events logged during the session (SPEC-302).

**Response `200`**
```json
{
  "session_id": "sess_abc123",
  "errors": [
    {
      "id": "err_001",
      "code": "LLM_TIMEOUT",
      "message": "Agent Alex timed out during the Argue phase.",
      "agent_id": "agt_001",
      "created_at": "..."
    }
  ]
}
```

---

### `GET /agents/presets`

Returns all agent presets — system presets (seeded on startup) and user-created presets.

**Response `200`**
```json
{
  "presets": [
    {
      "id": "uuid-...",
      "display_name": "The Challenger",
      "persona_description": "You actively contest prevailing positions...",
      "expertise": "Critical analysis, logical fallacy detection",
      "suggested_model": "claude-opus-4-6",
      "llm_provider": "anthropic",
      "category": "general",
      "is_system": true
    }
  ]
}
```

---

### `POST /agents/presets`

Save a user-created persona preset.

**Request**
```json
{
  "display_name": "My Custom Expert",
  "persona_description": "...",
  "expertise": "...",
  "suggested_model": "gpt-5.4",
  "llm_provider": "openai",
  "category": "engineering"
}
```

**Response `201`** — created preset record.

---

### `DELETE /agents/presets/{id}`

Delete a user-created preset. Returns `403` if `is_system=true`. Response `204`.

---

### `GET /sessions/templates`

List all saved session templates (SPEC-402).

**Response `200`**
```json
{
  "templates": [
    {
      "id": "uuid-...",
      "name": "Startup Board v2",
      "description": "Weekly board meeting format",
      "agents": [ { "display_name": "CEO", "role": "participant", ... } ],
      "config": { "max_rounds": 3, ... },
      "created_at": "..."
    }
  ]
}
```

---

### `POST /sessions/templates`

Save a new session template.

**Request**
```json
{
  "name": "Startup Board v2",
  "description": "Optional description",
  "agents": [ { "display_name": "CEO", "role": "participant", ... } ],
  "config": { "max_rounds": 3, "convergence_majority": 0.6, ... }
}
```

**Response `201`** — created template record.

---

### `DELETE /sessions/templates/{id}`

Delete a session template. Response `204`. Returns `404` if not found.

---

### `POST /sessions/{id}/save-as-template`

Create a template from an existing session's agents and config (topic excluded).

**Request**
```json
{
  "name": "Startup Board v2",
  "description": "Optional"
}
```

**Response `201`** — created template record. Returns `404` if session not found.

---

### `GET /sessions`

List of all sessions (for home page).

**Response `200`**
```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "topic": "...",
      "status": "ended",
      "agent_count": 4,
      "rounds_elapsed": 3,
      "created_at": "...",
      "ended_at": "..."
    }
  ]
}
```

---

## 5. WebSocket Event Schema

Connect to `WS /sessions/{id}/stream`. All events are JSON with a `type` discriminator field.

```typescript
type BaseEvent = { type: string; session_id: string; timestamp: string }
```

---

### `SESSION_START`
```json
{
  "type": "SESSION_START",
  "session_id": "sess_abc123",
  "timestamp": "...",
  "topic": "...",
  "prompt": "...",
  "agents": [ { "id": "agt_001", "display_name": "Alex", "role": "participant" } ]
}
```

### `THINK_START` / `THINK_END`
```json
{
  "type": "THINK_START",
  "session_id": "...",
  "timestamp": "...",
  "agent_id": "agt_001"
}
```

### `TOKEN_GRANTED`
```json
{
  "type": "TOKEN_GRANTED",
  "session_id": "...",
  "timestamp": "...",
  "agent_id": "agt_001",
  "round_index": 1,
  "turn_index": 1
}
```

### `ARGUMENT_POSTED`
```json
{
  "type": "ARGUMENT_POSTED",
  "session_id": "...",
  "timestamp": "...",
  "argument": {
    "id": "arg_001",
    "agent_id": "agt_001",
    "agent_name": "Alex",
    "round_index": 1,
    "turn_index": 1,
    "content": "..."
  }
}
```

### `UPDATE_START` / `UPDATE_END`
```json
{
  "type": "UPDATE_START",
  "session_id": "...",
  "timestamp": "...",
  "agent_id": "agt_001"
}
```

### `THOUGHT_UPDATED`
Emitted only if `thought_inspector_enabled = true`.
```json
{
  "type": "THOUGHT_UPDATED",
  "session_id": "...",
  "timestamp": "...",
  "thought": {
    "id": "tht_002",
    "agent_id": "agt_001",
    "version": 2,
    "content": "..."
  }
}
```

### `TOKEN_REQUEST`
```json
{
  "type": "TOKEN_REQUEST",
  "session_id": "...",
  "timestamp": "...",
  "agent_id": "agt_001",
  "novelty_tier": "new_information",
  "priority_score": 0.78,
  "position_in_queue": 2
}
```

### `QUEUE_UPDATED`
```json
{
  "type": "QUEUE_UPDATED",
  "session_id": "...",
  "timestamp": "...",
  "queue": [
    { "agent_id": "agt_002", "priority_score": 0.82, "novelty_tier": "new_information", "position": 1 },
    { "agent_id": "agt_001", "priority_score": 0.78, "novelty_tier": "disagreement", "position": 2 }
  ]
}
```

### `CONVERGENCE_CHECK`
```json
{
  "type": "CONVERGENCE_CHECK",
  "session_id": "...",
  "timestamp": "...",
  "status": "converging",   // open | converging | cap_reached
  "rounds_elapsed": 2,
  "novel_claims_this_round": 0
}
```

### `SESSION_PAUSED` / `SESSION_RESUMED`
```json
{ "type": "SESSION_PAUSED", "session_id": "...", "timestamp": "..." }
```

### `SESSION_END`
```json
{
  "type": "SESSION_END",
  "session_id": "...",
  "timestamp": "...",
  "reason": "consensus",    // consensus | cap | host
  "rounds_elapsed": 3
}
```

### `SUMMARY_POSTED`
```json
{
  "type": "SUMMARY_POSTED",
  "session_id": "...",
  "timestamp": "...",
  "summary": {
    "id": "sum_001",
    "content": "...",
    "termination_reason": "consensus"
  }
}
```

### `ERROR`
```json
{
  "type": "ERROR",
  "session_id": "...",
  "timestamp": "...",
  "code": "LLM_TIMEOUT",
  "message": "Agent Alex timed out during the Argue phase.",
  "agent_id": "agt_001"
}
```

---

## 6. Data Flows

### 6.1 Session Start & Think Phase

```
Frontend                    Backend (Orchestrator)              LLM
   │                               │                             │
   ├─ POST /sessions/{id}/start ──►│                             │
   │                               ├─ broadcast SESSION_START    │
   │◄── 202 Accepted ──────────────┤                             │
   │                               ├─ for each agent (parallel): │
   │                               │   ├─ broadcast THINK_START  │
   │                               │   ├─ build Think prompt ───►│
   │                               │   │◄── Thought content ─────┤
   │                               │   ├─ save Thought to SQLite  │
   │                               │   └─ broadcast THINK_END    │
   │                               │                             │
   │                               ├─ for each agent (parallel): │
   │                               │   ├─ build Decide prompt ──►│
   │                               │   │◄── novelty_tier + bool ─┤
   │                               │   └─ push to PriorityQueue  │
   │                               │                             │
   │                               └─ broadcast QUEUE_UPDATED    │
```

### 6.2 Argue Phase (one turn)

```
Orchestrator               Agent                  All Others           LLM
     │                       │                        │                 │
     ├─ pop from queue ──────►│                        │                 │
     ├─ broadcast TOKEN_GRANTED                        │                 │
     │                       │                        │                 │
     │                       ├─ build Argue prompt ──────────────────────►│
     │                       │◄── Argument content ───────────────────────┤
     │                       ├─ save Argument to SQLite                    │
     │                       └─ broadcast ARGUMENT_POSTED                  │
     │                                                │                 │
     │              ◄─────────────────────────────────┤                 │
     │              for each remaining agent (parallel):               │
     │              ├─ broadcast UPDATE_START         │                 │
     │              ├─ build Update prompt ───────────────────────────►│
     │              │◄── revised Thought ────────────────────────────  │
     │              ├─ save new Thought version       │                 │
     │              ├─ broadcast THOUGHT_UPDATED      │                 │
     │              │                                 │                 │
     │              ├─ build Decide prompt ──────────────────────────►│
     │              │◄── token request decision ─────────────────────  │
     │              ├─ push to queue if yes           │                 │
     │              └─ broadcast UPDATE_END           │                 │
     │                                                │                 │
     ├─ broadcast QUEUE_UPDATED                       │                 │
     └─ evaluate convergence → broadcast CONVERGENCE_CHECK             │
```

### 6.3 Termination & Scribe Phase

```
Orchestrator               Scribe                           LLM
     │                       │                               │
     ├─ convergence/cap/host  │                               │
     ├─ broadcast TOKEN_GRANTED (scribe)                      │
     │                       │                               │
     │                       ├─ build Scribe prompt ─────────►│
     │                       │   (full transcript +           │
     │                       │    moderator state)           │
     │                       │◄── summary content ───────────┤
     │                       ├─ save Summary to SQLite        │
     │                       └─ broadcast SUMMARY_POSTED      │
     │                                                        │
     └─ broadcast SESSION_END                                 │
```

---

## 7. Prompt Architecture

All prompts are built as structured message arrays (`system` + `user` turns). Prompts are Python functions in `llm/prompts/`, each taking a typed context object and returning `list[Message]`.

### 7.1 Shared Context Bundle

Every prompt phase receives a `ContextBundle`:

```python
@dataclass
class ContextBundle:
    topic: str
    prompt: str                         # original human question
    supporting_context: str | None      # host-provided documents/notes
    agent: Agent                        # the agent being called
    current_thought: str | None         # agent's private thought (latest version)
    transcript: list[Argument]          # full public argument history
    round_index: int
    turn_index: int
```

### 7.2 Think Prompt Structure

```
[SYSTEM]
You are {agent.display_name}. {agent.persona_description}
Your area of expertise is: {agent.expertise}

You are participating in a structured round table discussion.
Your task is to form your INITIAL, INDEPENDENT position on the topic.
You have NOT yet heard what other participants think.
Do not be influenced by others — reason purely from your expertise.

[USER]
Topic: {topic}
Human question: {prompt}

{supporting_context if present}

Provide your initial thought: your position, the 2-3 strongest arguments
supporting it, and the counterarguments you anticipate.
Format: structured paragraphs, no bullet points.
```

### 7.3 Argue Prompt Structure

```
[SYSTEM]
You are {agent.display_name}. {agent.persona_description}

You have been given the token to speak. Argue from your current position.
Be direct, specific, and concise. Do not repeat what others have already said.
Maximum 200 words.

[USER]
Topic: {topic}
Human question: {prompt}

Your current private position (use this as your basis):
{current_thought}

Discussion so far:
{transcript — formatted as "AgentName: argument\n"}

Now give your argument.
```

### 7.4 Decide Prompt Structure

```
[SYSTEM]
You are {agent.display_name}. {agent.persona_description}

After hearing the last argument, decide whether you need to speak again.
Only request the token if you have:
  (a) A material factual error to correct, OR
  (b) Genuinely new information not yet in the discussion.

Do NOT request the token to repeat, rephrase, or lightly reinforce.

[USER]
Your updated position: {current_thought}
Last argument posted: {last_argument}
Full transcript: {transcript}

Respond with ONLY a JSON object:
{
  "request_token": true | false,
  "novelty_tier": "factual_correction" | "new_information" | "disagreement" | "synthesis" | "reinforcement",
  "justification": "One sentence explaining why you need to speak."
}
```

### 7.5 Moderator Convergence Prompt

The Moderator evaluates convergence after each turn. It does not argue — it analyses.

```
[SYSTEM]
You are a neutral discussion moderator. You have no opinions on the topic.
Your only job is to assess the state of the discussion.

[USER]
Topic: {topic}
Config: majority_threshold={config.convergence_majority}, max_rounds={config.max_rounds}
Current round: {round_index} / {config.max_rounds}

Full transcript: {transcript}
Current claim registry: {moderator_state.claim_registry}

Tasks:
1. Extract any NEW claims from the most recent argument not in the registry.
2. Update the alignment map (which agents agree/disagree with each claim).
3. Assess whether a {convergence_majority*100}% majority has formed around a dominant position.
4. Assess whether the last argument introduced genuinely new information.

Respond with ONLY a JSON object:
{
  "new_claims": ["..."],
  "alignment_updates": { "claim_id": { "agree": ["agt_001"], "disagree": [] } },
  "majority_reached": true | false,
  "dominant_position": "summary of winning position or null",
  "novel_information_present": true | false
}
```

---

## 8. Key Technical Decisions

### 8.1 Async-first backend

FastAPI is fully async. All LLM calls, DB writes, and WS broadcasts use `async/await`. The parallel Think and Update phases use `asyncio.gather()` — critical for keeping latency acceptable when there are 4+ agents.

### 8.2 Prompt responses always parsed as JSON for structured phases

The Decide and Moderator prompts return structured JSON. Parsing is wrapped in a retry loop (max 2 retries) with a prompt that reminds the model to return only JSON if the first response fails to parse.

### 8.3 One orchestrator per session

`SessionOrchestrator` is created and held in an in-process registry (`dict[session_id, SessionOrchestrator]`) on the FastAPI app's lifespan. It is never persisted — if the server restarts, in-flight sessions must be restarted. This is acceptable for a local-first tool.

### 8.4 Streaming LLM responses (v1: off)

In v1, LLM calls complete before broadcasting. Streaming per-token to the frontend is a natural v2 enhancement — the WS infrastructure already supports it, but the orchestrator loop is simpler to reason about without it.

### 8.5 SQLite WAL mode

SQLite is configured in WAL (Write-Ahead Logging) mode to support concurrent reads during writes. Important because the frontend polls `GET /sessions/{id}/transcript` while the orchestrator is actively writing.

---

## 9. Environment & Configuration

```bash
# .env (backend)
DATABASE_URL=sqlite+aiosqlite:///./ai_round_table.db
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...            # Required for Gemini provider
OLLAMA_BASE_URL=http://localhost:11434  # Required for Ollama provider
LLM_TIMEOUT_SECONDS=180       # Per-call LLM timeout (default: 180)
LOG_DIR=                      # Optional: directory for per-session prompt logs

# .env.local (frontend)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_USE_MOCK=false   # set true for frontend-only dev
```

All backend settings are managed via `pydantic-settings` in `core/config.py`. No config is hardcoded.

---

## 10. Dependencies

### Backend

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `sqlalchemy[asyncio]` | ORM + async engine |
| `aiosqlite` | Async SQLite driver |
| `alembic` | DB migrations |
| `pydantic-settings` | Config management |
| `openai` | OpenAI API client (also used by Ollama provider) |
| `anthropic` | Anthropic API client |
| `google-genai` | Google Gemini API client |
| `httpx` | Async HTTP (required by google-genai) |
| `python-multipart` | File uploads (supporting context) |

### Frontend

| Package | Purpose |
|---|---|
| `next` | Framework |
| `react`, `react-dom` | UI |
| `zustand` | State management |
| `msw` | API mocking for parallel dev |
| `tailwindcss` | Styling |
| `framer-motion` | Token animation + transitions |
