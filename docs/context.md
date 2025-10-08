# Directory Context: docs

## Purpose & Scope
- Architectural and operational documentation for OpenAgent contributors.

## Key Themes
- Prompt & protocol maintenance (`prompt-maintenance.md`, `context-indexing.md`).
- Operational runbooks (`ops-overview.md`, `publishing.md`).
- Engineering design notes (`class-interface-refactor-ideas.md`, `js-dependency-graph.md`).
- FAQ and troubleshooting guides (`faq.md`, `openai-cancellation.md`).

## Positive Signals
- Documents explicitly target AI agents (e.g., context indexing guide), aligning with repo automation goals.
- Coverage spans both developer ergonomics and deployment processes, reducing institutional knowledge gaps.

## Risks / Gaps
- Some documents are brainstorming notes rather than canonical guidance; verify freshness before acting.
- Lacks a top-level index summarizing relationships between documents beyond file names—use this context plus `docs-crosslinks.md` as entry points.

## Related Context
- Prompt assets referenced throughout: [`../prompts/context.md`](../prompts/context.md).
- Release automation described here ties to [`../scripts/context.md`](../scripts/context.md) and [`.github/workflows/context.md`](../.github/workflows/context.md).
