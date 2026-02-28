# AGENTS.md

Project guidance for coding agents working in this repository.

## Project docs
- Product requirements: `docs/PRD.md`
- Architecture: `docs/ARCHITECTURE.md`
- Execution plan/specs: `docs/TASK_PLAN.md`

## Source of truth for skills
- Primary skills are maintained in `.claude/skills/`.
- Compatibility paths are symlinked:
  - `.agent/skills/` (Antigravity-style)
  - `.agents/skills/` (open agent skills-style)

## Repository conventions
- Keep changes minimal and scoped to the user request.
- Prefer updating existing files over introducing new abstractions.
- Avoid breaking API contracts without updating related docs and handlers.

## Useful workflow
- Search code: `rg "pattern"`
- List files: `rg --files`
- Check git state: `git status --short`

## Documentation updates
When behavior or architecture changes, update the corresponding file in `docs/` in the same PR/commit.
