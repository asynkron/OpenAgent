# Directory Context: src/utils

## Purpose & Scope

- Shared utility functions supporting the agent runtime, CLI, and tests.

## Key Modules

- `asyncQueue.ts` — generic async iterator/queue abstraction used by the agent runtime for event pipelines.
- `cancellation.ts` — cooperative cancellation registry (`register`, `cancel`) for long-running commands with typed tokens/entries so registrants surface misuse at compile time.
- `contextUsage.ts` — tracks token usage metrics for display in the CLI.
- `fetch.ts` — fetch-like wrapper that prefers the global implementation and falls back to Node's `http`/`https` modules. Recent refactors split timeout handling, header normalization, and Node streaming into focused helpers so the code is easier to reason about during failure analysis.
- `jsonAssetValidator.ts` — validates JSON files against provided schemas; leveraged by scripts/tests.
- `output.ts` — formatting helpers for CLI output and logs, now typed to guarantee string outputs. The `combineStdStreams` helper tolerates missing exit codes so observation builders can share the same implementation across typed and untyped callers.
- `plan.ts` — plan tree clone/merge/progress utilities used by agent runtime & UI.
  - Incoming items with `status: 'abandoned'` now remove the matching plan branch during merge.
  - Steps waiting on dependencies now remain blocked if any dependency failed instead of treating failure as completion.
  - Merging no longer downgrades locally completed/failed steps when the assistant resends them as pending, preventing command replays.
  - Updated command payloads from the assistant overwrite the stored command and reset failed or abandoned steps back to `pending` so retries pick up the new details, unless the assistant marks the step as `completed`.
  - Assistant plan updates flagged as `completed` no longer overwrite cleared commands, so canceled steps stay dormant until the assistant intentionally reopens them.
  - UI-triggered cancellations drop the stored command payload so the assistant must opt in again before another execution.
  - Assistant-provided statuses are ignored (except `abandoned`) so the runtime owns status transitions, and any newly merged steps start in `pending`.
  - Deep-clone helper ensures persisted plans round-trip without clearing locally managed status/observation fields.
  - Merge keys normalize `id` values case-insensitively so assistant resends with different casing still hit the same step.
  - Progress helpers only treat canonical terminal statuses (`completed`, `failed`) as finished; tests assert unrecognized values like `done` remain pending.
  - `PlanItem`/`PlanTree` types now derive from the tool schema (extending it with runtime-only fields), so plan manager, executor, and formatters consume a consistent, strongly typed structure instead of `Record<string, unknown>`.
- `text.ts` (emits `text.js` for runtime consumption) — string helpers (filters, tailing, shell splitting).

Recent migrations tightened the TypeScript coverage for `asyncQueue`, `contextUsage`, `jsonAssetValidator`, `cancellation`, `fetch`,
and `output`, replacing `@ts-nocheck` annotations with explicit types to surface errors during compilation.

## Positive Signals

- Utilities are mostly pure and individually unit-tested via the co-located `__tests__/` suites, minimizing regressions when refactoring.
- Plan utilities implement tree-aware merging, enabling plan persistence features.

## Risks / Gaps

- Some utilities assume Node >=18 features (e.g., `AbortController`); confirm compatibility when targeting older runtimes.
- `fetch.ts` rethrows errors with minimal context; wrap with additional logging when used in new surfaces.

## Related Context

- Consumers across runtime/UI: [`../agent/context.md`](../agent/context.md), [`../cli/context.md`](../cli/context.md).
- Validation usage: [`../../scripts/context.md`](../../scripts/context.md); tests live in [`__tests__/`](__tests__/).
