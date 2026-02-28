---
name: sync-contract
description: >
  Manually triggers full contract synchronisation. Use after any change to
  shared/types/ to ensure Pydantic schemas and MSW handlers are up to date.
  Delegates to the contract-enforcer subagent.
disable-model-invocation: true
---

Invoke the `contract-enforcer` subagent to synchronise:
1. `backend/schemas/` (Pydantic) with `shared/types/` (TypeScript source of truth)
2. `frontend/lib/mock/handlers.ts` (MSW) with `shared/types/api.ts`
3. `frontend/lib/mock/simulator.ts` with `shared/types/events.ts`
4. `frontend/store/sessionStore.ts` WS event handlers with `shared/types/events.ts`

Return a full sync report with ✅ in-sync, 🔧 auto-fixed, and ⚠️ needs review sections.
