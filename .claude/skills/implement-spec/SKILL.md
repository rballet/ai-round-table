---
name: implement-spec
description: >
  Implements a spec from the task plan end-to-end. Invoke with the spec ID:
  /implement-spec SPEC-101-BE. Reads the spec, delegates to the right subagent,
  then triggers contract enforcement and test writing.
disable-model-invocation: false
---

Implement the spec identified by: $ARGUMENTS

## Steps

1. **Read the spec**: find `SPEC-$ARGUMENTS` in `docs/TASK_PLAN.md` and read it fully

2. **Determine track**:
   - Suffix `-BE` → delegate to `backend-dev` subagent
   - Suffix `-FE` → delegate to `frontend-dev` subagent
   - No suffix → read the spec to determine which modules are affected

3. **Delegate implementation**: use the appropriate subagent with the full spec text as context

4. **Sync contract**: if the spec touched `shared/types/`, invoke the `contract-enforcer` subagent

5. **Sync mocks**: if the spec added new WS events or REST endpoints, invoke the `mock-sync` subagent

6. **Write tests**: invoke the `test-writer` subagent for the implemented spec

7. **Report**: summarise what was built, what tests were written, and any open items
