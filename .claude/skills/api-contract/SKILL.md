---
name: api-contract
description: >
  Full API contract for AI Round Table — REST endpoint shapes and WebSocket event
  schemas. Auto-loaded whenever writing API code, adding endpoints, or updating
  mock handlers. Reference before any schema or type work.
---

## REST Endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/sessions` | `CreateSessionRequest` | `Session` |
| POST | `/sessions/{id}/start` | `StartSessionRequest` | `{ status }` |
| GET | `/sessions/{id}` | — | `Session` |
| GET | `/sessions` | — | `{ sessions: Session[] }` |
| GET | `/sessions/{id}/transcript` | — | `{ arguments: Argument[] }` |
| GET | `/sessions/{id}/thoughts` | — | `{ thoughts: Thought[] }` |
| GET | `/sessions/{id}/queue` | — | `{ queue: QueueEntry[] }` |
| POST | `/sessions/{id}/pause` | — | `{ status }` |
| POST | `/sessions/{id}/resume` | — | `{ status }` |
| POST | `/sessions/{id}/end` | — | `{ status }` |
| GET | `/sessions/{id}/summary` | — | `Summary` |
| GET | `/agents/presets` | — | `{ presets: AgentPreset[] }` |

## Key Enums

**Agent roles:** `"moderator"` | `"scribe"` | `"participant"`

**Session statuses:** `"configured"` | `"running"` | `"paused"` | `"ending"` | `"ended"`

**Convergence termination reasons:** `"consensus"` | `"cap"` | `"host"`

**Novelty tiers (Decide phase):** `"factual_correction"` | `"new_information"` | `"disagreement"` | `"synthesis"` | `"reinforcement"`

## WebSocket

Connect to `WS /sessions/{id}/stream`. All events are JSON with a `type` discriminator.

```typescript
type BaseEvent = { type: string; session_id: string; timestamp: string }
```

**Event types (discriminated union on `type`):**
`SESSION_START`, `THINK_START`, `THINK_END`, `TOKEN_GRANTED`, `ARGUMENT_POSTED`,
`UPDATE_START`, `UPDATE_END`, `THOUGHT_UPDATED`, `TOKEN_REQUEST`, `QUEUE_UPDATED`,
`CONVERGENCE_CHECK`, `SESSION_PAUSED`, `SESSION_RESUMED`, `SESSION_END`, `SUMMARY_POSTED`, `ERROR`

## Selected Payloads

### SESSION_START
```json
{ "type": "SESSION_START", "session_id": "...", "timestamp": "...",
  "topic": "...", "prompt": "...",
  "agents": [{ "id": "agt_001", "display_name": "Alex", "role": "participant" }] }
```

### ARGUMENT_POSTED
```json
{ "type": "ARGUMENT_POSTED", "session_id": "...", "timestamp": "...",
  "argument": { "id": "arg_001", "agent_id": "agt_001", "agent_name": "Alex",
                "round_index": 1, "turn_index": 1, "content": "..." } }
```

### TOKEN_REQUEST
```json
{ "type": "TOKEN_REQUEST", "session_id": "...", "timestamp": "...",
  "agent_id": "agt_001", "novelty_tier": "new_information",
  "priority_score": 0.78, "position_in_queue": 2 }
```

### QUEUE_UPDATED
```json
{ "type": "QUEUE_UPDATED", "session_id": "...", "timestamp": "...",
  "queue": [{ "agent_id": "agt_002", "priority_score": 0.82,
              "novelty_tier": "new_information", "position": 1 }] }
```

### CONVERGENCE_CHECK
```json
{ "type": "CONVERGENCE_CHECK", "session_id": "...", "timestamp": "...",
  "status": "converging", "rounds_elapsed": 2, "novel_claims_this_round": 0 }
```

### SESSION_END
```json
{ "type": "SESSION_END", "session_id": "...", "timestamp": "...",
  "reason": "consensus", "rounds_elapsed": 3 }
```

### ERROR
```json
{ "type": "ERROR", "session_id": "...", "timestamp": "...",
  "code": "LLM_TIMEOUT", "message": "Agent Alex timed out.", "agent_id": "agt_001" }
```
