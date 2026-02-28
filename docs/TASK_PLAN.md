# AI Round Table — Task Plan & Feature Specs

**Version:** 0.1  
**Status:** Draft  
**Author:** Raphael — Dipolo AI  
**Date:** February 2026  
**Depends on:** PRD v0.1, Technical Design v0.1

---

## Overview

Development is split into two parallel tracks — **Backend** and **Frontend** — that converge at the end of each phase for integration. The frontend begins with MSW mocks and the WS Simulator so UI work can proceed independently from day one.

The plan has four phases:

| Phase | Name | Goal |
|---|---|---|
| **0** | Foundation | Project scaffolding, shared types, CI |
| **1** | Core Engine | Session lifecycle, agent think/argue loop, basic UI |
| **2** | Full Discussion Flow | Priority queue, convergence, scribe, full live UI |
| **3** | Polish & Integration | Thought inspector, session history, error handling, e2e tests |

---

## Phase 0 — Foundation

**Duration estimate:** 1–2 days  
**Goal:** Both tracks can run, talk to each other, and deploy locally. No features yet.

Both tracks must be completed before Phase 1 begins. This phase is not parallelisable.

### TASK-001 · Monorepo scaffolding

Set up the project structure as defined in the technical design.

- [x] Initialise `backend/` with FastAPI + uvicorn
- [x] Initialise `frontend/` with Next.js (App Router, TypeScript, Tailwind)
- [x] Create `shared/types/` with placeholder type files
- [x] Add root `package.json` with workspaces for `frontend` and `shared`
- [x] Add `.env.example` files for both packages
- [x] Add `README.md` with setup instructions (install, dev, env vars)

**Done when:** `cd backend && uvicorn main:app` and `cd frontend && npm run dev` both run without errors.

---

### TASK-002 · Shared type definitions

Define all TypeScript types in `shared/types/`. These are the contract — both tracks depend on them.

- [x] `session.ts` — `Session`, `SessionStatus`, `SessionConfig`
- [x] `agent.ts` — `Agent`, `AgentRole`, `AgentPreset`, `QueueEntry`
- [x] `events.ts` — union type `RoundTableEvent` covering all WS event types
- [x] `api.ts` — all REST request/response interfaces

**Done when:** Types are importable from `frontend` without errors and Pydantic schemas in `backend/schemas/` match.

---

### TASK-003 · Backend: database setup

- [x] Configure SQLAlchemy async engine with `aiosqlite`
- [x] Enable WAL mode on SQLite
- [x] Define all ORM models (Session, Agent, Thought, Argument, QueueEntry, ModeratorState, Summary)
- [x] Set up Alembic and generate initial migration
- [x] Write `database.py` with `get_db` async dependency

**Done when:** `alembic upgrade head` creates a valid `.db` file with all tables.

---

### TASK-004 · Backend: health check + CORS

- [x] `GET /health` returns `{ "status": "ok" }`
- [x] CORS configured for `http://localhost:3000`
- [x] WebSocket endpoint skeleton at `WS /sessions/{id}/stream` (accepts connection, does nothing yet)

**Done when:** Frontend can fetch `/health` and connect to the WS endpoint without errors.

---

### TASK-005 · Frontend: API client + mock infrastructure

- [x] Write typed `lib/api.ts` REST client wrapping `fetch`
- [x] Set up MSW with `lib/mock/handlers.ts` returning empty/fixture responses for all endpoints
- [x] Write `lib/mock/simulator.ts` WS simulator skeleton
- [x] Add `NEXT_PUBLIC_USE_MOCK` env flag that activates MSW + simulator

**Done when:** Frontend loads, hits mock endpoints, and receives fixture data without a running backend.

---

## Phase 1 — Core Engine

**Duration estimate:** 4–6 days  
**Goal:** A session can be created, agents think in parallel, one agent argues, the result is stored and streamed to the frontend.

---

### SPEC-101 · Session Creation

**Track:** Backend + Frontend (parallel after TASK-002)

#### Backend: `SPEC-101-BE`

- [ ] `POST /sessions` — validate request, persist Session + Agents to SQLite, return `201`
- [ ] `GET /sessions` — return list of all sessions
- [ ] `GET /sessions/{id}` — return session with agents
- [ ] `GET /agents/presets` — return hardcoded list of persona templates
- [ ] Unit tests for session service

**Inputs:** `CreateSessionRequest`  
**Outputs:** `Session` with nested `Agent[]`  
**Edge cases:** Fewer than 2 participant agents → `400`. No moderator agent → `400`. No scribe agent → `400`.

#### Frontend: `SPEC-101-FE`

- [ ] Session list page (`/`) — shows all sessions with status badges
- [ ] Session setup page (`/sessions/new`) — multi-step form:
  - Step 1: Topic + supporting context (text area + optional file paste)
  - Step 2: Agent lineup — add/remove agents, configure each (name, persona, expertise, provider, model)
  - Step 3: Config — max rounds, convergence majority, priority weights, thought inspector toggle
- [ ] Preset panel — click a preset to pre-fill a new agent form
- [ ] `POST /sessions` on submit, redirect to `/sessions/{id}` on success
- [ ] All backed by MSW mocks

**Done when:** A session can be created end-to-end (mock on frontend, real on backend) and appears in the session list.

---

### SPEC-102 · LLM Client Abstraction

**Track:** Backend only

- [ ] Implement `BaseLLMProvider` abstract class
- [ ] Implement `OpenAIProvider` — wraps `openai` async client
- [ ] Implement `AnthropicProvider` — wraps `anthropic` async client
- [ ] Implement `LLMClient` with provider registry
- [ ] Unit tests with mocked HTTP responses for both providers
- [ ] Error handling: timeout (30s), rate limit (retry once with backoff), invalid response

**Done when:** `LLMClient.complete(provider, model, messages, config)` works for both providers and handles errors gracefully.

---

### SPEC-103 · Think Phase

**Track:** Backend only

- [ ] Implement `think.py` prompt builder — takes `ContextBundle`, returns `list[Message]`
- [ ] Implement `AgentRunner.think(agent, context_bundle)` — calls LLM, saves `Thought` to SQLite
- [ ] Implement parallel execution in `SessionOrchestrator._phase_think()` using `asyncio.gather()`
- [ ] Broadcast `THINK_START` before each LLM call, `THINK_END` after
- [ ] `POST /sessions/{id}/start` triggers the orchestrator

**Done when:** Calling `start` on a session causes all participant agents to think in parallel, thoughts are saved to SQLite, and WS events are emitted.

---

### SPEC-104 · Single Argue Turn

**Track:** Backend only (builds on SPEC-103)

- [ ] Implement `argue.py` prompt builder
- [ ] Implement `AgentRunner.argue(agent, context_bundle)` — calls LLM, saves `Argument`
- [ ] Implement `decide.py` prompt builder
- [ ] Implement `AgentRunner.decide(agent, context_bundle)` — returns `DecideResult`
- [ ] Implement `QueueManager` with `asyncio.PriorityQueue`
- [ ] Implement `ModeratorEngine.compute_priority_score(entry, state)` 
- [ ] One full turn loop: dequeue → argue → broadcast → return token
- [ ] `QueueEntry` audit records written to SQLite on every push/pop

**Done when:** After the think phase, one agent is dequeued, argues, and the argument is saved and broadcast.

---

### SPEC-105 · Live Session UI (skeleton)

**Track:** Frontend only (parallel with SPEC-103/104)

- [ ] Live session page (`/sessions/{id}`) layout — table canvas left, argument feed right
- [ ] `RoundTable` component — static SVG ellipse with agent seats arranged by index
- [ ] `AgentSeat` component — avatar circle, name label, static status badge
- [ ] `ArgumentFeed` component — scrollable list, `ArgumentBubble` for each entry
- [ ] `useWebSocket` hook — connects to WS, dispatches events to Zustand store
- [ ] `sessionStore` Zustand slice — handles `ARGUMENT_POSTED`, `THINK_START/END`, `TOKEN_GRANTED`
- [ ] WS Simulator emits: `SESSION_START → THINK_START (×N) → THINK_END (×N) → TOKEN_GRANTED → ARGUMENT_POSTED`
- [ ] All states visible: agent avatars react to simulator events (thinking spinner, active glow)

**Done when:** Loading the page with `USE_MOCK=true` shows a populated table with animated agents responding to the simulated event sequence.

---

### Phase 1 Integration

- [ ] Connect frontend live session page to real backend
- [ ] Verify WS events arrive and trigger correct UI states
- [ ] Manual end-to-end test: create session → start → watch one argument appear in UI

---

## Phase 2 — Full Discussion Flow

**Duration estimate:** 5–7 days  
**Goal:** A complete round table runs from first question to Scribe summary, with the full priority queue, convergence detection, and live UI.

---

### SPEC-201 · Update & Decide Phase

**Track:** Backend (builds on SPEC-104)

- [ ] Implement `update.py` prompt builder
- [ ] Implement `AgentRunner.update(agent, context_bundle)` — updates Thought, saves new version
- [ ] Implement `SessionOrchestrator._phase_update_all()` — parallel updates for all non-active agents
- [ ] Implement `SessionOrchestrator._phase_decide_all()` — parallel decide calls, re-queue if yes
- [ ] Broadcast `UPDATE_START/END`, `THOUGHT_UPDATED` (if inspector enabled), `TOKEN_REQUEST`, `QUEUE_UPDATED`

**Done when:** After each argument, all other agents update their thoughts and submit new queue entries.

---

### SPEC-202 · Full Orchestration Loop

**Track:** Backend (builds on SPEC-201)

- [ ] Implement the full `while not should_terminate()` loop in `SessionOrchestrator`
- [ ] Implement round counting (`round_index` increments when all agents have had one opportunity)
- [ ] Implement hard turn cap check (rounds_elapsed ≥ max_rounds)
- [ ] Implement `SessionOrchestrator._phase_scribe()` — grant token to Scribe, save Summary
- [ ] `scribe.py` prompt builder — receives full transcript + moderator state
- [ ] Implement `POST /sessions/{id}/pause` and `/resume` — sets an asyncio Event flag the loop checks
- [ ] Implement `POST /sessions/{id}/end` — sets termination flag

**Done when:** A full session runs to completion (via cap) and produces a Summary in SQLite.

---

### SPEC-203 · Convergence Detection

**Track:** Backend (builds on SPEC-202)

- [ ] Implement `moderator.py` prompt builder for convergence check
- [ ] Implement `ModeratorEngine.evaluate_convergence()` — calls LLM, parses JSON response, updates claim registry and alignment map
- [ ] Integrate into orchestration loop after each argue turn
- [ ] Broadcast `CONVERGENCE_CHECK` event after each evaluation
- [ ] Handle both termination paths: consensus and cap

**Done when:** A session terminates organically when majority is reached with no new claims, and the termination reason is correctly set.

---

### SPEC-204 · Priority Queue UI

**Track:** Frontend (parallel with SPEC-201/202)

- [ ] `QueuePanel` component — ordered list of queued agents with priority score bars and novelty tier badges
- [ ] Animates on `QUEUE_UPDATED` events — entries slide in/out
- [ ] `TokenChip` component — SVG chip that animates from one seat to another on `TOKEN_GRANTED`
- [ ] Agent status transitions driven by events:
  - `THINK_START` → thinking spinner
  - `TOKEN_GRANTED` → active glow + highlight
  - `UPDATE_START` → subtle update pulse
  - `TOKEN_REQUEST` → hand-raise indicator
- [ ] `SessionStatus` bar — current round / max rounds, convergence status indicator
- [ ] WS Simulator extended to emit the full event sequence for a 2-round discussion

**Done when:** The simulator runs a complete fake discussion and every agent status, token movement, and queue change is reflected correctly in the UI.

---

### SPEC-205 · Argument Feed & Summary View

**Track:** Frontend (parallel with SPEC-202/203)

- [ ] `ArgumentBubble` — expand/collapse, agent role badge, round/turn label
- [ ] Auto-scroll to latest argument, pause auto-scroll when user scrolls up
- [ ] `SESSION_END` event triggers summary overlay/panel
- [ ] Summary rendered as formatted Markdown
- [ ] Termination reason badge (consensus / cap / host)

**Done when:** The argument feed works smoothly through a full simulated session and the summary panel displays correctly.

---

### SPEC-206 · REST Endpoints for Transcript & Summary

**Track:** Backend

- [ ] `GET /sessions/{id}/transcript` — full ordered arguments
- [ ] `GET /sessions/{id}/thoughts` — latest thoughts per agent (+ version history query params)
- [ ] `GET /sessions/{id}/queue` — current queue snapshot
- [ ] `GET /sessions/{id}/summary` — scribe summary

**Done when:** All four endpoints return correct data for a completed session.

---

### Phase 2 Integration

- [ ] Full end-to-end run: create session → start → watch full discussion → see summary
- [ ] Test pause/resume mid-session
- [ ] Test force-end before convergence
- [ ] Verify cap termination produces a correctly labelled summary

---

## Phase 3 — Polish & Integration

**Duration estimate:** 3–4 days  
**Goal:** Production-quality error handling, thought inspector, session history, and end-to-end tests.

---

### SPEC-301 · Thought Inspector

**Track:** Backend + Frontend

**Backend:**
- [ ] `GET /sessions/{id}/thoughts` supports `?version=` for history
- [ ] `THOUGHT_UPDATED` events only emitted when `thought_inspector_enabled=true`

**Frontend:**
- [ ] `ThoughtInspector` panel — expandable sidebar showing current private thought per agent
- [ ] Updates live on `THOUGHT_UPDATED` events
- [ ] Thought history viewer — version timeline for each agent
- [ ] Toggle visibility per session (respects setup config)

---

### SPEC-302 · Error Handling

**Track:** Backend + Frontend

**Backend:**
- [ ] LLM timeout (30s) → broadcast `ERROR` event, mark agent as `errored`, continue with remaining queue
- [ ] LLM returns unparseable JSON on Decide/Moderator prompts → retry once, then use fallback (request_token=false)
- [ ] Agent errors do not crash the orchestration loop
- [ ] `ERROR` events logged to SQLite

**Frontend:**
- [ ] `ERROR` event displays inline notification in argument feed
- [ ] Errored agent seat shows error state icon
- [ ] Toast notifications for transient errors

---

### SPEC-303 · Session History Page

**Track:** Frontend

- [ ] Home page (`/`) — full session list with search/filter by status
- [ ] Completed session view — read-only transcript + summary (no live WS)
- [ ] Session metadata: duration, agent count, rounds, termination reason
- [ ] Link to download transcript as Markdown

---

### SPEC-304 · Supporting Context UX

**Track:** Frontend + Backend

**Frontend:**
- [ ] Context input in session setup — plain text area + paste support
- [ ] Character/token count indicator
- [ ] Preview how context will appear in Think prompt

**Backend:**
- [ ] Validate context length (max ~4000 chars in v1)
- [ ] Context stored on `Session.supporting_context`
- [ ] Injected into Think prompt builder for all agents

---

### SPEC-305 · End-to-End Tests

- [ ] Backend: pytest integration tests covering full session lifecycle with a mock LLM provider
- [ ] Frontend: Playwright tests covering session creation, live session UI with simulator, summary display
- [ ] Contract tests: verify frontend types match backend Pydantic schemas

---

## Development Guidelines

### Branching

```
main
├── phase/0-foundation
├── phase/1-core-engine
│   ├── feat/be-spec-101    # backend branch
│   └── feat/fe-spec-105    # frontend branch
├── phase/2-full-flow
└── phase/3-polish
```

Feature branches merge into their phase branch. Phase branches merge into `main` at integration points.

### Mock discipline

The frontend mock layer (`MSW + WS Simulator`) must be kept in sync with the API contract at all times. Any endpoint or event change requires updating:
1. `shared/types/` — TypeScript types
2. `backend/schemas/` — Pydantic schemas
3. `frontend/lib/mock/handlers.ts` — MSW handlers
4. `frontend/lib/mock/simulator.ts` — if a WS event changed

### Definition of Done (per task)

- [ ] Feature works end-to-end with real backend (or mock for FE-only tasks)
- [ ] Happy path covered by at least one automated test
- [ ] TypeScript compiles with no errors
- [ ] No `console.error` in the browser during normal operation
- [ ] PR reviewed before merge to phase branch