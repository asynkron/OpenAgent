# Directory Context: src/utils

## Purpose & Scope

- Shared utility functions supporting the agent runtime, CLI, and tests.

## Key Modules

- `asyncQueue.js` — async iterator/queue abstraction used by the agent runtime for event pipelines.
- `cancellation.js` — cooperative cancellation registry (`register`, `cancel`) for long-running commands.
- `contextUsage.js` — tracks token usage metrics for display in the CLI.
- `fetch.js` — thin wrapper around `undici`/`node-fetch` semantics with timeout & error normalization.
- `jsonAssetValidator.js` — validates JSON files against provided schemas; leveraged by scripts/tests.
- `output.js` — formatting helpers for CLI output and logs.
- `plan.js` — plan tree clone/merge/progress utilities used by agent runtime & UI.
  - Incoming items with `status: 'abandoned'` now remove the matching plan branch during merge.
  - Steps waiting on dependencies now remain blocked if any dependency failed instead of treating failure as completion.
  - Merging no longer downgrades locally completed/failed steps when the assistant resends them as pending, preventing command replays.
  - Assistant-provided statuses are ignored (except `abandoned`) so the runtime owns status transitions, and any newly merged steps start in `pending`.
  - Deep-clone helper ensures persisted plans round-trip without clearing locally managed status/observation fields.
  - Merge keys normalize `id` values case-insensitively so assistant resends with different casing still hit the same step.
- `text.js` — string helpers (filters, tailing, shell splitting).

## Positive Signals

- Utilities are mostly pure and individually unit-tested via the co-located `__tests__/` suites, minimizing regressions when refactoring.
- Plan utilities implement tree-aware merging, enabling plan persistence features.

## Risks / Gaps

- Some utilities assume Node >=18 features (e.g., `AbortController`); confirm compatibility when targeting older runtimes.
- `fetch.js` rethrows errors with minimal context; wrap with additional logging when used in new surfaces.

## Related Context

- Consumers across runtime/UI: [`../agent/context.md`](../agent/context.md), [`../cli/context.md`](../cli/context.md).
- Validation usage: [`../../scripts/context.md`](../../scripts/context.md); tests live in [`__tests__/`](__tests__/).
