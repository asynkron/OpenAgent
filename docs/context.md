# Directory Context: docs

## Purpose

- Collects architectural notes and roadmap material for evolving OpenAgent.
- Serves as design history for modernization (ESM migration, tooling) and operational features like cancellation.

## Key Files

- `modernization-plan.md`: staged roadmap covering lint/format adoption, ESM migration, service extraction, observability.
- `openai-cancellation.md`: research note confirming AbortSignal support in `openai@6.x` and fallback strategies.
- `js-dependency-graph.md`: Mermaid diagram mapping relative imports among ESM modules.

## Positive Signals

- Modernization plan outlines concrete sequencing, making large refactors less risky.
- Cancellation note confirms SDK capabilities, informing the ESC cancel flow in `src/agent/loop.js`.
- `openai-cancellation.md` now documents verified integration/regression tests so operational behaviour stays in sync with code.

## Risks / Gaps

- Roadmap task list is partially unchecked; status may be stale relative to current code.
- No quick summary linking these insights back into their implementation hotspots (now covered via this context index).

## Related Context

- High-level repo map: [`../context.md`](../context.md)
- Agent loop implementation consuming the cancellation guidance: [`../src/agent/context.md`](../src/agent/context.md)
