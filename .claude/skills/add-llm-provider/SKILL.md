---
name: add-llm-provider
description: >
  Adds a new LLM provider to the backend. Invoke with the provider name:
  /add-llm-provider gemini. Creates the provider file, registers it in LLMClient,
  and updates the frontend preset options.
disable-model-invocation: false
---

Add a new LLM provider: $ARGUMENTS

## Steps

1. Read `backend/llm/providers/base.py` to understand the interface
2. Read `backend/llm/providers/openai.py` as an implementation reference
3. Create `backend/llm/providers/$ARGUMENTS.py` implementing `BaseLLMProvider`
4. Register the new provider in `backend/llm/client.py` `_providers` dict
5. Add the provider as an option in `frontend/components/setup/AgentConfigurator.tsx` (the provider dropdown)
6. Add default model options for this provider in the same component
7. Run `cd backend && python -m pytest tests/test_llm_client.py -v` — add a test for the new provider using mocked HTTP responses
8. Update `docs/ARCHITECTURE.md` dependencies section if a new package is needed
