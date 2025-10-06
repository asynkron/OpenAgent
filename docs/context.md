# Directory Context: docs

## Purpose

- Centralizes long-form documentation on architecture, operational procedures, and release workflows.
- Records historical decisions and research so contributors can understand why subsystems behave the way they do.

## Key Files

- `openai-cancellation.md`: research note confirming AbortSignal support in `openai@6.x`, with integration/regression test summaries.
- `publishing.md`: documents the GitHub Actions-powered npm release pipeline, troubleshooting guidance (e.g. npm 403 errors),
  and the manual fallback procedure.
- `class-interface-refactor-ideas.md`: outlines stateful modules that could graduate into classes/interfaces for clearer encapsulation.
- `js-dependency-graph.md`: Mermaid diagram mapping relative imports among ESM modules.

## Positive Signals

- Cancellation note stays synced with the ESC handling tests in `tests/integration/agentCancellation.integration.test.js`.
- Publishing guide removes guesswork for npm releases and aligns with the automation in `.github/workflows`.
- Architectural idea logs provide vetted options for future refactors without forcing immediate action.

## Risks / Gaps

- Some documents still rely on manual cross-linking; continue adding references into `context.md` files as new docs land.
- Dependency graph requires occasional regeneration after major refactors.

## Related Context

- High-level repo map: [`../context.md`](../context.md)
- Agent loop implementation consuming the cancellation guidance: [`../src/agent/context.md`](../src/agent/context.md)
- Release automation scripts: [`../scripts/context.md`](../scripts/context.md)
