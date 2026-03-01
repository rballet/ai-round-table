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
- [x] Add matching Pydantic schemas in `backend/schemas/` for contract parity

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

### Phase 0 Review Notes (2026-02-28 · Recheck)

- [x] Resolved since last review: `frontend/.env.example` is now tracked, `backend/schemas/` has been added in the workspace, and MSW handlers now cover the API client endpoints.
- [x] `MSWProvider` creates and exposes `WSSimulator`, and `frontend/src/app/page.tsx` calls `simulator.start(...)` on mount, proving both mock REST and WS simulator activation.

---

## Phase 1 — Core Engine

**Duration estimate:** 4–6 days  
**Goal:** A session can be created, agents think in parallel, one agent argues, the result is stored and streamed to the frontend.

---

### SPEC-101 · Session Creation

**Track:** Backend + Frontend (parallel after TASK-002)

#### Backend: `SPEC-101-BE`

- [x] `POST /sessions` — validate request, persist Session + Agents to SQLite, return `201`
- [x] `GET /sessions` — return list of all sessions
- [x] `GET /sessions/{id}` — return session with agents
- [x] `GET /agents/presets` — return hardcoded list of persona templates
- [x] Unit tests for session service

**Inputs:** `CreateSessionRequest`  
**Outputs:** `Session` with nested `Agent[]`  
**Edge cases:** Fewer than 2 participant agents → `400`. No moderator agent → `400`. No scribe agent → `400`.

#### Frontend: `SPEC-101-FE`

- [x] Session list page (`/`) — shows all sessions with status badges
- [x] Session setup page (`/sessions/new`) — multi-step form:
  - Step 1: Topic + supporting context (text area + optional file paste)
  - Step 2: Agent lineup — add/remove agents, configure each (name, persona, expertise, provider, model)
  - Step 3: Config — max rounds, convergence majority, priority weights, thought inspector toggle
- [x] Preset panel — click a preset to pre-fill a new agent form
- [x] `POST /sessions` on submit, redirect to `/sessions/{id}` on success
- [x] All backed by MSW mocks

**Done when:** A session can be created end-to-end (mock on frontend, real on backend) and appears in the session list.

---

### SPEC-102 · LLM Client Abstraction

**Track:** Backend only

- [x] Implement `BaseLLMProvider` abstract class
- [x] Implement `OpenAIProvider` — wraps `openai` async client
- [x] Implement `AnthropicProvider` — wraps `anthropic` async client
- [x] Implement `LLMClient` with provider registry
- [x] Unit tests with mocked HTTP responses for both providers
- [x] Error handling: timeout (30s), rate limit (retry once with backoff), invalid response

**Done when:** `LLMClient.complete(provider, model, messages, config)` works for both providers and handles errors gracefully.

---

### SPEC-103 · Think Phase

**Track:** Backend only

- [x] Implement `think.py` prompt builder — takes `ContextBundle`, returns `list[Message]`
- [x] Implement `AgentRunner.think(agent, context_bundle)` — calls LLM, saves `Thought` to SQLite
- [x] Implement parallel execution in `SessionOrchestrator._phase_think()` using `asyncio.gather()`
- [x] Broadcast `THINK_START` before each LLM call, `THINK_END` after
- [x] `POST /sessions/{id}/start` triggers the orchestrator

**Done when:** Calling `start` on a session causes all participant agents to think in parallel, thoughts are saved to SQLite, and WS events are emitted.

---

### SPEC-104 · Single Argue Turn

**Track:** Backend only (builds on SPEC-103)

- [x] Implement `argue.py` prompt builder
- [x] Implement `AgentRunner.argue(agent, context_bundle)` — calls LLM, saves `Argument`
- [x] Implement `decide.py` prompt builder
- [x] Implement `AgentRunner.decide(agent, context_bundle)` — returns `DecideResult`
- [x] Implement `QueueManager` with `asyncio.PriorityQueue`
- [x] Implement `ModeratorEngine.compute_priority_score(entry, state)` 
- [x] One full turn loop: dequeue → argue → broadcast → return token
- [x] Milestone boundary: after think phase, execute exactly one dequeue/argue cycle, then stop (do not run full convergence loop yet)
- [x] Session state after milestone run remains `running` (discussion is incomplete and continues in later specs)
- [x] `QueueEntry` audit records written to SQLite on every push/pop
- [x] Tests: unit tests for prompt builders/queue scoring + integration test for think → one argue turn with WS events and DB persistence

**Done when:** After the think phase, one agent is dequeued, argues once, the argument is saved and broadcast, queue audit writes exist, and tests cover the single-turn path.

---

### SPEC-105 · Live Session UI (skeleton)

**Track:** Frontend only (parallel with SPEC-103/104)

- [x] Live session page (`/sessions/{id}`) layout — table canvas left, argument feed right
- [x] `RoundTable` component — static SVG ellipse with agent seats arranged by index
- [x] `AgentSeat` component — avatar circle, name label, static status badge
- [x] `ArgumentFeed` component — scrollable list, `ArgumentBubble` for each entry
- [x] `useWebSocket` hook — connects to WS, dispatches events to Zustand store
- [x] `sessionStore` Zustand slice — handles `ARGUMENT_POSTED`, `THINK_START/END`, `TOKEN_GRANTED`, `QUEUE_UPDATED`
- [x] WS Simulator emits: `SESSION_START → THINK_START (×N) → THINK_END (×N) → QUEUE_UPDATED → TOKEN_GRANTED → ARGUMENT_POSTED → QUEUE_UPDATED`
- [x] All states visible: agent avatars react to simulator events (thinking spinner, active glow)

**Done when:** Loading the page with `USE_MOCK=true` shows a populated table with animated agents responding to the simulated event sequence.

---

### Phase 1 Integration

- [x] Connect frontend live session page to real backend
- [x] "Start Discussion" panel on live session page — prompts user for opening prompt, calls `POST /sessions/{id}/start`
- [x] Backend `SESSION_START` event now broadcasts full agent data (all fields required by frontend `Agent` type)
- [x] Verify WS events arrive and trigger correct UI states (manual) — all 8 event types confirmed: SESSION_START, THINK_START/END, QUEUE_UPDATED, TOKEN_GRANTED, ARGUMENT_POSTED
- [x] Manual end-to-end test: create session → start → watch one argument appear in UI (mock path verified; real backend path code-complete, requires LLM API keys to run)

---

## Phase 2 — Full Discussion Flow

**Duration estimate:** 5–7 days  
**Goal:** A complete round table runs from first question to Scribe summary, with the full priority queue, convergence detection, and live UI.

---

### SPEC-201 · Update & Decide Phase

**Track:** Backend (builds on SPEC-104)

- [x] Implement `update.py` prompt builder
- [x] Implement `AgentRunner.update(agent, context_bundle)` — updates Thought, saves new version
- [x] Implement `SessionOrchestrator._phase_update_all()` — parallel updates for all non-active agents
- [x] Implement `SessionOrchestrator._phase_decide_all()` — parallel decide calls, re-queue if yes
- [x] Broadcast `UPDATE_START/END`, `THOUGHT_UPDATED` (if inspector enabled), `TOKEN_REQUEST`, `QUEUE_UPDATED`
- [x] Normalize novelty-tier contract before broadcast (`correction` is canonical, matches `shared/types/agent.ts`)
- [x] Tests: unit tests for update/decide prompt handling + integration test covering argue → update/decide → queue re-entry and WS emissions (`UPDATE_START/END`, `TOKEN_REQUEST`, `QUEUE_UPDATED`)

**Done when:** After each argument, all other agents update their thoughts and submit new queue entries.

---

### SPEC-202 · Full Orchestration Loop

**Track:** Backend (builds on SPEC-201)

- [x] Implement the full `while not should_terminate()` loop in `SessionOrchestrator`
- [x] Implement round counting (`round_index` increments when all agents have had one opportunity)
- [x] Implement hard turn cap check (rounds_elapsed ≥ max_rounds)
- [x] Implement `SessionOrchestrator._phase_scribe()` — grant token to Scribe, save Summary
- [x] `scribe.py` prompt builder — receives full transcript + moderator state
- [x] Implement `POST /sessions/{id}/pause` and `/resume` — sets an asyncio Event flag the loop checks
- [x] Implement `POST /sessions/{id}/end` — sets termination flag

**Done when:** A full session runs to completion (via cap) and produces a Summary in SQLite.

---

### SPEC-203 · Convergence Detection

**Track:** Backend (builds on SPEC-202)

- [x] Implement `moderator.py` prompt builder for convergence check
- [x] Implement `ModeratorEngine.evaluate_convergence()` — calls LLM, parses JSON response, updates claim registry and alignment map
- [x] Integrate into orchestration loop after each argue turn
- [x] Broadcast `CONVERGENCE_CHECK` event after each evaluation
- [x] Handle both termination paths: consensus and cap

**Done when:** A session terminates organically when majority is reached with no new claims, and the termination reason is correctly set.

---

### SPEC-204 · Priority Queue UI

**Track:** Frontend (parallel with SPEC-201/202)

- [x] `QueuePanel` component — ordered list of queued agents with priority score bars and novelty tier badges
- [x] Animates on `QUEUE_UPDATED` events — entries slide in/out
- [x] `TokenChip` component — SVG chip that animates from one seat to another on `TOKEN_GRANTED`
- [x] Agent status transitions driven by events:
  - `THINK_START` → thinking spinner
  - `TOKEN_GRANTED` → active glow + highlight
  - `UPDATE_START` → subtle update pulse
  - `TOKEN_REQUEST` → hand-raise indicator
- [x] `SessionStatus` bar — current round / max rounds, convergence status indicator
- [x] WS Simulator extended to emit the full event sequence for a 2-round discussion

**Done when:** The simulator runs a complete fake discussion and every agent status, token movement, and queue change is reflected correctly in the UI.

---

### SPEC-205 · Argument Feed & Summary View

**Track:** Frontend (parallel with SPEC-202/203)

- [x] `ArgumentBubble` — expand/collapse
- [x] `ArgumentBubble` — agent role badge
- [x] `ArgumentBubble` — round/turn label (already rendered in feed cards)
- [x] Auto-scroll to latest argument, pause auto-scroll when user scrolls up
- [x] WS Simulator emits `SESSION_END` + `SUMMARY_POSTED` in the 2-round flow (from SPEC-204)
- [x] `SESSION_END` / `SUMMARY_POSTED` events trigger summary overlay/panel
- [x] Summary rendered as formatted Markdown
- [x] Termination reason badge (consensus / cap / host)

**Done when:** The argument feed works smoothly through a full simulated session and the summary panel displays correctly.

---

### SPEC-206 · REST Endpoints for Transcript & Summary

**Track:** Backend

- [x] `GET /sessions/{id}/transcript` — full ordered arguments
- [x] `GET /sessions/{id}/thoughts` — latest thoughts per agent (+ version history query params)
- [x] `GET /sessions/{id}/queue` — current queue snapshot
- [x] `GET /sessions/{id}/summary` — scribe summary
- [x] Frontend follow-up after SPEC-205: hydrate Summary panel on page load for ended sessions via `GET /sessions/{id}/summary` (covers hard refresh without WS replay)

**Done when:** All four endpoints return correct data for a completed session.

---

### Phase 2 Integration

- [x] Full end-to-end run: create session → start → watch full discussion → see summary
- [x] Test pause/resume mid-session
- [x] Test force-end before convergence
- [x] Verify cap termination produces a correctly labelled summary
- [x] Update frontend to listen to `CONVERGENCE_CHECK` WS event and update progress bar
- [x] Add a button to return to the session creation page from a specific session
- [x] Add an option to delete a given session
- [x] Fix priority queue implementation to correctly remove old requests

---

## Phase 3 — Polish & Integration

**Duration estimate:** 3–4 days  
**Goal:** Production-quality error handling, thought inspector, session history, and end-to-end tests.

---

### SPEC-301 · Thought Inspector

**Track:** Backend + Frontend

**Backend:**
- [x] `GET /sessions/{id}/thoughts` supports `?version=` and `?agent_id=` for history
- [x] `THOUGHT_UPDATED` events only emitted when `thought_inspector_enabled=true`

**Frontend:**
- [x] `ThoughtInspector` panel — expandable sidebar showing current private thought per agent
- [x] Updates live on `THOUGHT_UPDATED` events
- [x] Thought history viewer — version timeline for each agent
- [x] Toggle visibility per session (respects setup config)

---

### SPEC-302 · Error Handling

**Track:** Backend + Frontend

**Backend:**
- [x] LLM timeout (30s) → broadcast `ERROR` event, mark agent as `errored`, continue with remaining queue
- [x] LLM returns unparseable JSON on Decide/Moderator prompts → retry once, then use fallback (request_token=false)
- [x] Agent errors do not crash the orchestration loop
- [x] `ERROR` events logged to SQLite

**Frontend:**
- [x] `ERROR` event displays inline notification in argument feed
- [x] Errored agent seat shows error state icon
- [x] Toast notifications for transient errors

---

### SPEC-303 · Session History Page

**Track:** Frontend

- [x] Home page (`/`) — full session list with search/filter by status
- [x] Completed session view — read-only transcript + summary (no live WS)
- [x] Session metadata: duration, agent count, rounds, termination reason
- [x] Link to download transcript as Markdown

---

### SPEC-304 · Supporting Context UX

**Track:** Frontend + Backend

**Frontend:**
- [x] Context input in session setup — plain text area + paste support
- [x] Character/token count indicator with amber warning (>85%) and red over-limit
- [x] Preview how context will appear in Think prompt (collapsible details)

**Backend:**
- [x] Validate context length (max ~4000 chars in v1) — 422 on exceed
- [x] Context stored on `Session.supporting_context`
- [x] Injected into Think prompt builder for all agents

---

### SPEC-305 · End-to-End Tests

- [x] Backend: pytest integration tests covering full session lifecycle with a mock LLM provider
- [x] Frontend: Playwright tests covering session creation, live session UI with simulator, summary display, session history
- [x] Contract tests: verify frontend types match backend Pydantic schemas

---

## Improvements & Enhancements

Post-Phase-3 improvements that are not tied to a specific release phase. Each is self-contained and can be implemented independently.

---

### SPEC-401 · Categorised Persona Library

**Track:** Backend + Frontend
**Status:** Planned

#### Rationale

The current preset panel presents all agent personas in a flat list. As domain-specific persona sets are added (e.g. startup board meeting, scientific review, policy analysis), the list would become unmanageable without structure. Additionally, there is no way for a user to save a custom persona they crafted for reuse in future sessions — they must reconfigure from scratch each time.

This spec introduces:
1. A `category` field on presets, surfaced in the UI as filter pills for quick navigation
2. A persistent user preset library backed by SQLite, so custom personas survive browser clears and are accessible from any device hitting the same backend

The default moderator and scribe remain universal (not categorised) since they are mandatory structural roles rather than domain-specific personas.

#### Design Decisions

- **Filter UI: pills (Option A)** — a horizontal row of category pills above the preset list, one active at a time, defaulting to `General`. Chosen for scannability and minimal footprint.
- **Category discovery: derived from data** — the frontend collects unique `category` values from the preset list it already fetches; no separate endpoint needed.
- **Persistence: SQLite, no auth** — single-user for now. When multi-user support is added, a `user_id` FK can be added to the table without changing the API contract.
- **System presets seeded on startup** — the hardcoded list in `agents.py` is replaced by a DB seed that runs once on first boot, tagged with `is_system=True`. The `GET /agents/presets` response shape is identical whether rows come from the seed or user creation, so the frontend requires no contract changes in either phase.

#### Backend

- [ ] Add `AgentPreset` ORM model (`backend/models/agent_preset.py`) with columns: `id` (UUID PK), `display_name`, `persona_description`, `expertise`, `suggested_model`, `llm_provider`, `category`, `is_system` (bool)
- [ ] Alembic migration for the new table
- [ ] Seed function: on startup, insert system presets if the table is empty (idempotent)
- [ ] `GET /agents/presets` — query DB, return all rows ordered by `is_system DESC, display_name ASC`
- [ ] `POST /agents/presets` — validate + insert user preset (`is_system=False`), return `201` with created record
- [ ] `DELETE /agents/presets/{id}` — delete user preset; return `403` if `is_system=True`
- [ ] Unit tests for preset service (seed idempotency, CRUD, system-preset guard)

#### Shared Types

- [ ] Add `category: string` and `is_system: boolean` to `AgentPreset` in `shared/types/agent.ts`
- [ ] Add `CreatePresetRequest` interface to `shared/types/api.ts`
- [ ] Mirror both changes in `backend/schemas/agent.py` and `backend/schemas/api.py`

#### Frontend

- [ ] Category filter pills above the preset list — `General | Business | Science & Research | Policy | Engineering | Creative` — defaulting to `General`
- [ ] User-created presets show a `×` delete button; system presets do not
- [ ] "Save as preset" icon button on each configured agent card in the lineup — opens an inline form (name + category picker), then `POST /agents/presets`
- [ ] Optimistic removal on delete with error rollback
- [ ] MSW handlers updated: `POST /agents/presets` (201), `DELETE /agents/presets/{id}` (204 / 403 for system)

#### Initial Category Set

| Key | Label | Example personas |
|---|---|---|
| `general` | General | Socratic Questioner, Devil's Advocate, Data Scientist, Ethicist, Systems Thinker, Futurist, Domain Expert |
| `business` | Business | CEO, CFO, CTO, Product Manager, Investor/VC, Legal Counsel, Strategic Advisor |
| `science` | Science & Research | Principal Investigator, Peer Reviewer, Statistician, Grant Writer |
| `policy` | Policy | Policy Analyst, Economist, Lobbyist, Civil Servant |
| `engineering` | Engineering | Tech Lead, Security Engineer, QA Engineer, DevOps Engineer, Architect |
| `creative` | Creative | Art Director, Writer, Critic, Producer |

**Done when:** The preset panel shows category pills, filtering works, user presets can be saved from the lineup and deleted from the panel, system presets are protected from deletion, and all user presets survive a backend restart.

**Future extension:** Adding `user_id` FK to `agent_presets` and filtering by identity in the service layer enables per-user libraries without touching the API contract or frontend.

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
