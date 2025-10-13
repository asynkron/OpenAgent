# Directory Context: docs

## Purpose & Scope

- Architectural and operational documentation for OpenAgent contributors.

## Key Themes

- Prompt & protocol maintenance (`prompt-maintenance.md`, `context-indexing.md`) now documents the sync workflow for mirrored copies and context indexes.
- Operational runbooks (`ops-overview.md`, `publishing.md`) highlight implementation hotspots for the agent loop, CLI runner, and release automation.
- FTA review notes (`fta-hotspots.md`) capture the latest static-analysis priorities so engineering work can target the highest-risk files first.
- Engineering design notes (`class-interface-refactor-ideas.md`, `js-dependency-graph.md`) keep architectural diagrams aligned with the current module layout.
- Workspace notes (`workspace-structure.md`) capture the package split, npm naming strategy, follow-on release steps, and
  guidance on co-locating package-level unit tests while keeping integration suites at the repository root.
- FAQ and troubleshooting guides (`faq.md`, `openai-cancellation.md`) now cover enabling local Git hooks, provide an example of
  a schema-compliant `open-agent` response payload, and document the corrective observation we emit when schema validation fails
  (examples kept Prettier-compliant for JSON parsing clarity).

## Positive Signals

- Documents explicitly target AI agents (e.g., context indexing guide), aligning with repo automation goals.
- Coverage spans both developer ergonomics and deployment processes, reducing institutional knowledge gaps.

## Risks / Gaps

- Some documents are brainstorming notes rather than canonical guidance; verify freshness before acting.
- Lacks a top-level index summarizing relationships between documents beyond file names—use this context plus `docs-crosslinks.md` as entry points.

## Related Context

- Prompt assets referenced throughout: [`../packages/core/prompts/context.md`](../packages/core/prompts/context.md).
- Release automation described here ties to [`../scripts/context.md`](../scripts/context.md) and [`.github/workflows/context.md`](../.github/workflows/context.md).
