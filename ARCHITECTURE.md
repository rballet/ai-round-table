# AI Round Table — Technical Design

**Version:** 0.1  
**Status:** Draft  
**Author:** Raphael — Dipolo AI  
**Date:** February 2026  
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
├── main.py                     # FastAPI app entry point, router registration
├── core/
│   ├── config.py               # Settings via pydantic-settings
│   ├── database.py             # SQLAlchemy async engine + session factory
│   └── exceptions.py           # Custom exception classes
├── models/                     # SQLAlchemy ORM models
│   ├── session.py
│   ├── agent.py
│   ├── thought.py
│   ├── argument.py
│   ├── queue_entry.py
│   ├── moderator_state.py
│   └── summary.py
├── schemas/                    # Pydantic request/response schemas
│   ├── session.py
│   ├── agent.py
│   ├── events.py               # WebSocket event payloads
│   └── api.py
├── routers/
│   ├── sessions.py             # REST: session lifecycle
│   ├── agents.py               # REST: agent/persona management
│   └── websocket.py            # WS: /sessions/{id}/stream
├── engine/
│   ├── moderator.py            # ModeratorEngine: queue, convergence, state
│   ├── agent_runner.py         # AgentRunner: LLM call dispatcher per phase
│   ├── orchestrator.py         # SessionOrchestrator: main async loop
│   ├── queue_manager.py        # QueueManager: asyncio.PriorityQueue wrapper
│   └── broadcast_manager.py    # BroadcastManager: in-process WS fan-out
├── llm/
│   ├── client.py               # Unified async LLM client (provider abstraction)
│   ├── providers/
│   │   ├── openai.py
│   │   ├── anthropic.py
│   │   └── base.py             # Abstract base: complete(messages) → str
│   └── prompts/
│       ├── think.py
│       ├── update.py
│       ├── argue.py
│       ├── decide.py
│       ├── moderator.py
│       └── scribe.py
├── services/
│   ├── session_service.py      # DB operations for sessions
│   ├── agent_service.py
│   ├── thought_service.py
│   ├── argument_service.py
│   └── queue_service.py        # QueueEntry audit log writes
└── alembic/                    # DB migrations
    └── versions/
```

### 2.2 Engine Layer Design

The engine is the core of the system. Three classes coordinate the entire discussion loop:

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

**`AgentRunner`** — stateless. Given an agent, a phase, and a context bundle, it calls the right prompt template and the right LLM provider. Returns a string. No side effects.

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
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home: session list + create new
│   ├── sessions/
│   │   ├── new/
│   │   │   └── page.tsx        # Session setup wizard
│   │   └── [id]/
│   │       └── page.tsx        # Live round table view
│   └── layout.tsx
├── components/
│   ├── table/
│   │   ├── RoundTable.tsx      # Main canvas/SVG table
│   │   ├── AgentSeat.tsx       # Individual agent avatar + status
│   │   ├── TokenChip.tsx       # Animated token
│   │   └── QueuePanel.tsx      # Priority queue sidebar
│   ├── feed/
│   │   ├── ArgumentFeed.tsx    # Scrollable argument list
│   │   ├── ArgumentBubble.tsx  # Single argument card
│   │   └── ThoughtInspector.tsx # Expandable private thought panel
│   ├── setup/
│   │   ├── SessionSetupForm.tsx
│   │   ├── AgentConfigurator.tsx  # Per-agent: name, persona, model
│   │   ├── ContextUploader.tsx    # Supporting documents
│   │   └── PresetsPanel.tsx       # Persona template picker
│   ├── controls/
│   │   ├── HostControls.tsx    # Pause/Resume/Force end
│   │   └── SessionStatus.tsx   # Round counter, convergence meter
│   └── ui/                     # Shared primitives (Button, Card, Badge…)
├── hooks/
│   ├── useSession.ts           # Session data + REST calls
│   ├── useWebSocket.ts         # WS connection + event dispatch
│   ├── useTableLayout.ts       # Agent seat position calculations
│   └── useAgentStatus.ts       # Derived agent state from WS events
├── lib/
│   ├── api.ts                  # Typed REST client (wraps fetch)
│   ├── mock/
│   │   ├── handlers.ts         # MSW request handlers
│   │   ├── fixtures.ts         # Static mock data
│   │   └── simulator.ts        # Fake WS event emitter for UI dev
│   └── utils.ts
├── store/
│   └── sessionStore.ts         # Zustand: live session state
└── types/                      # Re-exports from shared/types
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
  "supporting_context": "Our team has 4 engineers. Current stack is a Django monolith serving 50k MAU.",
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
      "llm_model": "claude-opus-4-5",
      "llm_config": { "temperature": 0.7, "max_tokens": 1000 },
      "role": "participant"
    },
    {
      "display_name": "Moderator",
      "persona_description": "You are a neutral discussion facilitator. You do not have opinions.",
      "expertise": "Facilitation",
      "llm_provider": "anthropic",
      "llm_model": "claude-sonnet-4-5",
      "llm_config": { "temperature": 0.2, "max_tokens": 500 },
      "role": "moderator"
    },
    {
      "display_name": "Scribe",
      "persona_description": "You are a precise technical writer. You summarise discussions without opinion.",
      "expertise": "Technical writing",
      "llm_provider": "openai",
      "llm_model": "gpt-4o",
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
      "llm_model": "claude-opus-4-5"
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

### `GET /agents/presets`

**Response `200`**
```json
{
  "presets": [
    {
      "id": "challenger",
      "display_name": "The Challenger",
      "persona_description": "You actively contest prevailing positions...",
      "expertise": "Critical analysis, logical fallacy detection",
      "suggested_model": "claude-opus-4-5"
    }
  ]
}
```

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
DATABASE_URL=sqlite+aiosqlite:///./roundtable.db
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

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
| `openai` | OpenAI API client |
| `anthropic` | Anthropic API client |
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
| `@radix-ui/react-*` | Accessible UI primitives |
| `lucide-react` | Icons |