# AI Round Table — Product Requirements Document

**Version:** 0.2
**Status:** Current
**Author:** Raphael — Dipolo AI
**Date:** February 2026 (updated March 2026)
**Stack:** Next.js · FastAPI · WebSockets · SQLite

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Agent Personas](#4-agent-personas)
5. [Core Discussion Flow](#5-core-discussion-flow)
6. [Token Priority System](#6-token-priority-system)
7. [Convergence & Termination](#7-convergence--termination)
8. [System Architecture](#8-system-architecture)
9. [UI Design](#9-ui-design)
10. [Data Model](#10-data-model)
11. [API Endpoints](#11-api-endpoints)
12. [Open Questions](#12-open-questions)

---

## 1. Overview

AI Round Table is a web application that orchestrates structured, turn-based debates between multiple AI agents around a single question posed by a human user. Inspired by classic round table formats — where every participant has a voice, a role, and a discipline — the system guarantees that every agent forms an **independent opinion before hearing others**, preventing the groupthink that plagues naive multi-agent pipelines.

The interface is modelled on an **online poker table**: agents are seated around a circular canvas, a token visually passes between them, and the conversation unfolds in a narrative feed alongside the table. The human is always the host — they set the topic, then watch (and optionally intervene) as agents deliberate to a conclusion.

---

## 2. Problem Statement

Current multi-agent LLM systems suffer from three core failure modes:

- **Anchoring bias:** agents see previous responses and simply agree or lightly rebut, rather than forming independent views.
- **Unstructured output:** without moderation, agents produce overlapping, unordered responses that are hard to synthesise.
- **No convergence signal:** conversations loop or terminate arbitrarily, with no principled endpoint.

AI Round Table addresses all three through a token-passing protocol, a two-phase cognition model (think silently → argue publicly), and a Moderator agent that actively monitors for consensus and terminates the session when new information stops being introduced — or when a hard cap on turns is reached.

---

## 3. Goals & Non-Goals

### 3.1 Goals

- Deliver a structured deliberation experience that produces a clear, defensible answer to any question.
- Guarantee independent initial opinions via parallel, isolated agent thinking before any public argument is shared.
- Implement a **priority-weighted token queue** so speaking turns are earned, not just queued FIFO.
- Provide a visually engaging, real-time poker-table UI that makes the discussion easy to follow.
- Enable configurable agent personas that can be registered and configured per session.
- Ensure the Moderator terminates discussions gracefully via consensus detection **or** a hard turn cap — whichever comes first.

### 3.2 Non-Goals (v1)

- Multi-human participants. One human host per session.
- Agents accessing the internet or external tools. They reason from training data and conversation context only.
- Persistent agent memory across sessions. Each round table starts fresh.
- Voice input/output.

---

## 4. Agent Personas

Agents are not constrained to a fixed role taxonomy at the system level. Each agent is defined by three fields set by the host:

- **Display name** — how the agent appears in the UI.
- **Persona description** — a free-text system prompt describing the agent's personality, communication style, and behavioural tendencies (e.g., "You are a sceptical data scientist who only accepts claims backed by empirical evidence").
- **Area of expertise** — free text that injects domain grounding into the agent's Think and Argue prompts.

The UI provides a set of **preset templates** the host can start from and modify freely. These presets are conveniences, not system constraints — no agent receives special treatment in the orchestration logic based on its template of origin.

Presets are stored in SQLite and seeded on backend startup. They are organised into six categories for navigation:

| Category | Example Presets |
|---|---|
| **General** | Socratic Questioner, Devil's Advocate, Data Scientist, Ethicist, Systems Thinker, Futurist, Domain Expert |
| **Business** | CEO, CFO, CTO, Product Manager, Investor/VC, Legal Counsel, Strategic Advisor |
| **Science & Research** | Principal Investigator, Peer Reviewer, Statistician, Grant Writer |
| **Policy** | Policy Analyst, Economist, Lobbyist, Civil Servant |
| **Engineering** | Tech Lead, Security Engineer, QA Engineer, DevOps Engineer, Architect |
| **Creative** | Art Director, Writer, Critic, Producer |

Moderator and Scribe presets are universal (not categorised) since they are mandatory structural roles.

Hosts can also **save custom presets** from their agent lineup for reuse across sessions. User-created presets are persisted in SQLite alongside system presets and can be deleted; system presets are protected.

> **Moderator and Scribe are the only structurally distinct agents.** Their prompts explicitly forbid positional statements and they do not participate in the token queue as speakers. All other agents — regardless of preset — are treated identically by the orchestration engine.

---

## 5. Core Discussion Flow

### 5.1 Two-Phase Cognition Model

> Every agent maintains a **private Thought** formed independently before any public argument is shared (Phase 1). This Thought is automatically updated after each public argument (Phase 2). When the agent is finally handed the token, it argues from its most recent Thought — ensuring its public output is informed by the full conversation while the original independent baseline is preserved in the log.

This is the central architectural invariant of the system. It prevents anchoring while still allowing genuine deliberation.

### 5.2 Step-by-Step Flow

#### Step 1 — Human Prompt
The human host submits a question or statement. This anchors the entire session. The question is broadcast simultaneously to all agents and the Moderator.

#### Step 2 — Parallel Silent Thinking (Phase 1)
All opinion-bearing agents receive the question in **parallel, isolated LLM calls**. Each agent produces a private **Thought**: its initial position, key arguments, and anticipated counterarguments. No agent sees any other agent's Thought at this point. The Moderator initialises its consensus tracker and priority queue.

#### Step 3 — Token Queue Initialisation
After thinking, each agent submits a token request. The Moderator builds the initial speaking order using the **priority scoring system** (see §6). The queue is visible to the host on the UI.

#### Step 4 — Token Granted: Agent Argues
The Moderator grants the token to the highest-priority agent in the queue. That agent produces a public **Argument** derived from its current private Thought. The Argument is appended to the shared transcript. The agent then returns the token to the Moderator.

#### Step 5 — Thought Update (Phase 2)
Immediately after each public Argument, all remaining agents receive the new content in a **background, parallel LLM call** and silently update their private Thought. This revised Thought is not published. The agent updates its position, strengthens or abandons claims, and prepares a more informed next argument. This happens concurrently for all agents not currently holding the token.

#### Step 6 — Re-queue Decision
After updating their Thought, each agent independently decides whether to re-enter the token queue. The **Decide prompt** forces a disciplined binary choice — an agent should request the token **only if**:

- There is a material factual error in the transcript to correct, **or**
- The agent has a genuinely new argument not yet present in the discussion.

Agents must not re-queue merely to restate or lightly rephrase a previous point. This decision, along with a short justification, is sent to the Moderator which applies priority scoring before admission to the queue.

#### Step 7 — Next Token Grant
The Moderator selects the next agent from the queue by priority score, grants the token, and Step 4 repeats. At each grant, the Moderator also evaluates the convergence condition (§7).

#### Step 8 — Convergence or Turn Cap
When the Moderator determines the discussion has converged (§7.1) **or** the configured maximum number of turns has been reached (§7.2), it closes the queue to new entries and grants the token to the Scribe.

#### Step 9 — Scribe Summary
The Scribe receives the full transcript and the Moderator's internal consensus notes. It produces a structured final document covering: the winning argument, key supporting evidence, significant dissenting positions, and any unresolved questions. This is the terminal artefact of the session.

### 5.3 Flow Diagram

```
Human Prompt
      │
      ▼
Parallel Think (all agents, isolated)
      │
      ▼
All agents → Token Request → Priority Queue
      │
      ▼
┌─────────────────────────────────────────┐
│  MODERATOR LOOP                         │
│                                         │
│  Dequeue highest-priority agent         │
│        │                                │
│        ▼                                │
│  Agent argues (public Argument)         │
│        │                                │
│        ▼                                │
│  All others: silent Thought Update ─────┤
│        │                                │
│        ▼                                │
│  Each agent: Decide → re-queue?         │
│        │                                │
│        ▼                                │
│  Convergence check + Turn cap check ────┤
│        │                                │
│   [No] └──────────── loop ─────────────┘
│   [Yes]
│        │
│        ▼
│  Pass token to Scribe
└─────────────────────────────────────────┘
      │
      ▼
Scribe produces final Summary
      │
      ▼
Session ends
```

---

## 6. Token Priority System

The Moderator does not grant tokens on a pure FIFO basis. Each queue entry is assigned a **priority score** that determines its position. This prevents any single agent from dominating and rewards patience.

### 6.1 Priority Score Formula

```
priority_score = W_recency × recency_score
              + W_novelty  × novelty_score
              + W_role     × role_weight
```

Where:

**`recency_score`** — how long ago this agent last held the token. Grows linearly with turns elapsed since last argument. An agent that has never spoken gets the maximum recency score.

```
recency_score = turns_since_last_argument / total_turns_elapsed
             (capped at 1.0, minimum 0.0)
```

**`novelty_score`** — a self-reported signal from the agent's Decide step. The agent must classify its re-queue reason:

| Reason | Score |
|---|---|
| First argument (never spoken) | 1.0 |
| Correcting a factual error | 0.9 |
| Introducing genuinely new information | 0.7 |
| Disagreeing with a specific point | 0.5 |
| Synthesising / connecting arguments | 0.4 |
| Reinforcing an existing position | 0.1 |

The Moderator may down-adjust the self-reported novelty score if it detects that the agent's justification text is semantically similar to an argument already in the transcript.

**`role_weight`** — a small structural bias to ensure persona diversity early in the discussion. This diminishes over time so the conversation is not artificially constrained.

| Role | Early weight (first 3 turns) | Late weight |
|---|---|---|
| Challenger | 1.2 | 1.0 |
| SME | 1.1 | 1.0 |
| Practitioner | 1.1 | 1.0 |
| Decision-Maker | 1.0 | 1.0 |
| Connector | 1.0 | 1.1 |

**`W_recency`, `W_novelty`, `W_role`** are configurable per session (defaults: 0.4, 0.5, 0.1).

### 6.2 Tie-breaking

If two agents have scores within 0.05 of each other, the Moderator breaks the tie **randomly** (coin flip). This preserves unpredictability and prevents gaming.

### 6.3 Moderator Overrides

The Moderator may forcibly insert a queue entry in one case:

- **Promotion:** if a persona type has not spoken in the last N turns (configurable, default 4), the Moderator may promote that agent's next queue entry to the top of the queue to enforce participation diversity.

The Moderator does **not** suppress or reject queue entries based on novelty assessment. Agents are solely responsible for deciding whether their contribution is worth the token.

---

## 7. Convergence & Termination

The session can end in three ways: organic consensus, forced turn cap, or host force-end.

### 7.1 Organic Convergence

The Moderator maintains a structured internal state:

- **Claim registry:** a deduplicated list of distinct claims made by any agent, extracted and normalised after each Argument.
- **Agent alignment map:** for each claim, which agents agree, disagree, or are neutral.
- **Novel information counter:** number of new claims introduced in the most recent round (one round = all agents have had at least one opportunity to speak since the last check).

The Moderator signals convergence when **all** of the following hold:

- The last full round introduced zero new claims into the claim registry.
- A configurable qualified majority of agents (default ≥ 60%) are aligned on the same dominant position.
- The token queue contains no entries with a novelty score above the "Reinforcing" tier (i.e., nothing substantively new is waiting to be said).

### 7.2 Hard Turn Cap

The session enforces a **maximum number of rounds** (configurable in session setup, default: 3 rounds). One round is defined as one complete speaking opportunity for each participating agent — so a session with 4 agents and a 3-round cap allows up to 12 total arguments before the cap triggers.

When the cap is reached, the Moderator immediately closes the queue and passes the token to the Scribe regardless of convergence status.

### 7.3 Host Force-End

At any time, the host can trigger an immediate end via the UI. This behaves identically to a turn cap trigger.

---

## 8. System Architecture

### 8.1 Component Map

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js Frontend                                           │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ Poker Table  │  │ Argument    │  │ Session Setup &  │    │
│  │ Canvas       │  │ Feed        │  │ Host Controls    │    │
│  └──────────────┘  └─────────────┘  └──────────────────┘    │
│           │                │                  │             │
│           └────────────────┴──────────────────┘             │
│                         WebSocket                           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│  FastAPI Backend (single process)                           │
│  ┌────────────────┐  ┌──────────────────────────────────┐   │
│  │ Session        │  │ Moderator Engine                 │   │
│  │ Orchestrator   │  │ - asyncio.PriorityQueue (live)   │   │
│  │                │  │ - Claim registry                 │   │
│  │                │  │ - Convergence evaluator          │   │
│  └────────────────┘  └──────────────────────────────────┘   │
│  ┌────────────────┐  ┌──────────────────────────────────┐   │
│  │ Agent Engine   │  │ WebSocket Broadcast Manager      │   │
│  │ - Think        │  │ - In-process fan-out             │   │
│  │ - Update       │  │ - session_id → WS connection set │   │
│  │ - Argue        │  └──────────────────────────────────┘   │
│  │ - Decide       │                                         │
│  └────────────────┘                                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   SQLite (on disk)  │
                    │   Sessions          │
                    │   Agents            │
                    │   Transcripts       │
                    │   Thoughts          │
                    │   Queue audit log   │
                    │   Moderator state   │
                    │   Summaries         │
                    │   Error events      │
                    │   Agent presets     │
                    │   Session templates │
                    └─────────────────────┘
```

**Local-first storage decisions:**

| Concern | Local (now) | Production (later) |
|---|---|---|
| Persistent data | SQLite on disk via SQLAlchemy + `aiosqlite` | Postgres — one connection string change |
| Live token queue | `asyncio.PriorityQueue` in-process | Redis sorted set — semantically identical |
| WebSocket fan-out | In-process broadcast manager | Redis pub/sub |

The abstraction boundary is intentional — the Moderator Engine interacts with a `QueueManager` interface, and the WebSocket manager sits behind a `BroadcastManager` interface. Swapping implementations for production requires no changes outside those modules.

### 8.2 Agent Prompt Phases

Each opinion-bearing agent has four distinct prompt templates:

| Phase | Trigger | Input Context | Output |
|---|---|---|---|
| **Think** | Human prompt received | Question only | Private Thought: position + key arguments + anticipated counters |
| **Update** | Any public Argument posted | Question + full transcript + current Thought | Revised private Thought |
| **Argue** | Token granted | Question + full transcript + current Thought | Public Argument |
| **Decide** | After Thought update | Question + full transcript + current Thought | Binary: request token (with reason + novelty tier) or pass |

### 8.3 WebSocket Event Schema

```
SESSION_START       { session_id, topic, prompt, agents[] }
THINK_START         { agent_id }
THINK_END           { agent_id }
TOKEN_GRANTED       { agent_id, round_index, turn_index }
ARGUMENT_POSTED     { argument: { id, agent_id, agent_name, round_index, turn_index, content } }
UPDATE_START        { agent_id }
UPDATE_END          { agent_id }
THOUGHT_UPDATED     { thought: { id, agent_id, version, content } }   // only if thought_inspector_enabled
TOKEN_REQUEST       { agent_id, novelty_tier, priority_score, position_in_queue }
QUEUE_UPDATED       { queue: [{ agent_id, priority_score, novelty_tier, position }] }
CONVERGENCE_CHECK   { status: "open" | "converging" | "cap_reached", rounds_elapsed, novel_claims_this_round }
SESSION_PAUSED      { }
SESSION_RESUMED     { }
SUMMARY_POSTED      { summary: { id, content, termination_reason } }
SESSION_END         { reason: "consensus" | "cap" | "host", rounds_elapsed }
ERROR               { code, message, agent_id? }
```

---

## 9. UI Design

### 9.1 Poker Table Canvas

The primary view is an elliptical table. Agent avatars are seated around the perimeter. The human host sits at the bottom-centre as the "dealer." Each avatar displays:

- Agent name and role badge.
- Status indicator: `idle` / `thinking` / `updating` / `in-queue` / `arguing`.
- Queue position badge (if currently queued).
- Priority score chip (visible on hover, for transparency).

The token is visualised as a glowing chip that animates between avatars on grant. A queue panel on one side shows the current speaking order with priority scores and novelty tiers.

### 9.2 Argument Feed

A chronological feed displays each public Argument in a speech-bubble layout, attributed to the agent with their role badge. Arguments are collapsed by default (first ~200 chars) with a "Read more" toggle. The feed auto-scrolls to the latest entry and is searchable.

### 9.3 Host Controls

| Control | Behaviour |
|---|---|
| **Prompt input** | Available at session start only. Once submitted, the discussion begins and the host cannot introduce new information. |
| **Pause / Resume** | Freezes the token queue; in-flight LLM calls complete but no new token is granted. |
| **Force end** | Immediately closes the queue and triggers the Scribe turn. |
| **Thought inspector** | Toggle to reveal any agent's current private Thought in real time (if enabled in session setup). |

### 9.4 Session Setup Panel

| Field | Description |
|---|---|
| **Session template** | Optional. Load a saved template to pre-fill the agent lineup and session config. The topic is always left blank (question-specific). Every field remains editable after loading. |
| **Topic / Question** | Required free text. The anchor for the entire session. |
| **Supporting context** | Optional. The host may attach background notes or raw text (max 4 000 characters) to be shared with all agents as a knowledge base. Injected into every agent's Think prompt before the discussion begins. No new context can be added once the session starts. |
| **Agent lineup** | Add any number of agents. For each: display name, free-text persona description, free-text area of expertise, LLM provider, and LLM model. Presets are browsable by category and any configured agent can be saved as a custom preset for reuse. |
| **Max rounds** | Hard turn cap expressed as total rounds, where one round = one speaking turn per participating agent (default: 3 rounds). |
| **Convergence majority** | % of agents that must align on the dominant position to trigger organic convergence (default: 60%). |
| **Priority weights** | W_recency, W_novelty, W_role sliders (defaults: 0.4, 0.5, 0.1). |
| **Thought visibility** | Toggle whether private Thoughts are visible to the host during the session via the Thought inspector. Thoughts are always stored regardless of this setting. |
| **Save as template** | Save the current agent lineup and session config as a named, reusable template (topic excluded). Templates persist in SQLite and appear in the template picker on future sessions. |

---

## 10. Data Model

```
Session
  id, topic, supporting_context (text, max 4 000 chars),
  status, config (JSON), created_at, ended_at, termination_reason

Agent
  id, session_id, display_name, persona_description (text),
  expertise (text), llm_provider, llm_model, llm_config (JSON), role
  → Any agent can be configured with any provider/model independently.
  → role enum: {moderator, scribe, participant}

Thought
  id, agent_id, session_id, version (increments per Update), content, created_at
  → Always stored. Optionally surfaced in the UI via Thought inspector.

Argument
  id, agent_id, session_id, round_index, turn_index, content, created_at
  → Public. Forms the canonical transcript.

QueueEntry
  id, session_id, agent_id, novelty_tier, justification, priority_score,
  created_at, processed_at

ModeratorState
  session_id, claim_registry (JSON), alignment_map (JSON),
  rounds_elapsed, novel_claims_last_round, consecutive_empty_rounds

Summary
  id, session_id, scribe_agent_id, content, termination_reason, created_at

ErrorEvent                                            (SPEC-302)
  id, session_id, agent_id (nullable), code, message, created_at
  → LLM timeouts, parse failures, and orchestrator errors logged here.

AgentPreset                                           (SPEC-401)
  id, display_name, persona_description, expertise,
  suggested_model, llm_provider, category, is_system (bool)
  → System presets seeded on startup (31 presets, 6 categories).
  → User presets created via POST /agents/presets; deletable (system presets protected).

SessionTemplate                                       (SPEC-402)
  id, name, description (nullable), agents (JSON), config (JSON), created_at
  → Topic excluded. Agents and config are snapshots — sessions derived from a
    template are fully independent after creation.
```

---

## 11. API Endpoints

```
# Session lifecycle
GET    /sessions                              List all sessions
POST   /sessions                              Create a new session with agent config
GET    /sessions/{id}                         Get session metadata and current status
DELETE /sessions/{id}                         Delete session and all associated data
POST   /sessions/{id}/start                   Submit human prompt, begin token flow
POST   /sessions/{id}/pause                   Freeze token queue
POST   /sessions/{id}/resume                  Resume token queue
POST   /sessions/{id}/end                     Force terminate → trigger Scribe

# Session data
GET    /sessions/{id}/transcript              Full public argument history
GET    /sessions/{id}/thoughts                Private thought log (filter: ?agent_id=, ?version=)
GET    /sessions/{id}/queue                   Current priority queue snapshot
GET    /sessions/{id}/summary                 Retrieve Scribe's final document
GET    /sessions/{id}/errors                  Error events logged during the session

# Session templates
GET    /sessions/templates                    List all saved templates
POST   /sessions/templates                    Save a new template (agents + config, no topic)
DELETE /sessions/templates/{id}               Delete a template
POST   /sessions/{id}/save-as-template        Create a template from an existing session

# Agent presets
GET    /agents/presets                        List all presets (system + user-created)
POST   /agents/presets                        Save a user-created preset
DELETE /agents/presets/{id}                   Delete a user preset (403 for system presets)

# WebSocket
WS     /sessions/{id}/stream                  Real-time event stream
```

---

## 12. Open Questions

All questions resolved. Decisions recorded below for traceability.

| Question | Decision |
|---|---|
| **Thought storage** | Store all Thoughts permanently. No privacy concern; the full thought history is valuable for research, debugging, and session replay. |
| **Moderator LLM** | Every agent — including the Moderator and Scribe — has a fully configurable model and provider, set in the session setup UI. Preset defaults are provided but the user can override any agent independently. See updated §9.4. |
| **Novelty self-reporting** | Agents self-report. Moderator does not verify. Resolved in previous iteration. |
| **Multi-session continuity** | No follow-up session chaining. Instead, the host may attach **supporting context** (documents, background notes, data) before the session starts. This context is injected into every agent's Think prompt as a shared knowledge base. See §9.4 and updated data model. |
| **Injection semantics** | Mid-session host injection is removed entirely from v1. The host cannot introduce new information once the discussion has started. This simplifies the convergence model and avoids the reset edge case. The Inject control is removed from the UI. |
| **Token cap** | Expressed as **total rounds**, where one round = one complete speaking turn for each participating agent. More intuitive for the host to reason about. |
| **Agent disagreement floor** | No special treatment for any persona. Agents are defined by a free-text persona description and area of expertise — no hardcoded behavioural constraints on any role. The Challenger is a default preset template, not a privileged system type. |