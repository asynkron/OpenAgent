# Directory Context: packages/cli/src

## Purpose & Scope

- Implements the interactive terminal UI and runtime wiring for the CLI package.
- Depends on `@asynkron/openagent-core` for orchestration, startup flags, and shared utilities.

## Key Areas

- `components/` — Ink React components for rendering responses, plans, commands, status messages, and debug panels. All runtime files now ship as TSX modules so JSX syntax is available throughout. See [`components/context.md`](components/context.md).
- `bootProbes/` — environment probes that detect toolchains (Node, Python, Git, etc.) and surface status in the CLI. Probes now type-check alongside the registry helpers and compile to ESM in `dist/`. See [`bootProbes/context.md`](bootProbes/context.md).
- `runner.ts` & `runtime.ts` — orchestrate CLI startup, validate required environment configuration (e.g., `OPENAI_API_KEY`), normalize the agent runtime dependencies with the shared core bindings declared in `types/openagent-core.d.ts`, and pipe events into Ink with typed IO utilities. The runtime now wraps Ink rendering with a dedicated lifecycle helper so completion and error paths resolve exactly once.
- `runtimeDependencies.ts` & `runtimeLifecycle.ts` — extracted helpers that encapsulate the core dependency bundle and Ink lifecycle wiring so `runtime.ts` stays focused on orchestrating the agent loop.
- `loadCoreModule.ts` — dynamically resolves `@asynkron/openagent-core`, falls back to the local workspace copy when `node_modules` links are absent, and now delegates import retries to `loadCoreModuleHelpers.ts` so the public API stays focused on memoization.
- `loadCoreModuleHelpers.ts` — shared helpers that normalize importer overrides, build fallback specifiers, validate exports, and expose the import-with-fallback loop for targeted tests.
- `render.ts`, `status.ts`, `thinking.ts` — helper utilities for formatting markdown, plan progress, context usage, and spinner indicators.
- `io.ts` — wraps readline input handling, exposing `askHuman` and ESC detection constants.
- `components/commandUtils.ts`, `components/planUtils.ts`, `components/progressUtils.ts` — shared formatting utilities that feed both Ink components and legacy console renderers, now exported as typed helpers. `commandUtils.ts` is a facade that re-exports the decomposed helpers under `components/command/` (type inference, detail builders, summary generation) so consumers gain the smaller modules without rewriting imports.

## Positive Signals

- Separation between runtime wiring and presentation components simplifies testing; many components have unit coverage.
- Co-located `__tests__/` folders (e.g., under `components/`, `bootProbes/`, and `src/__tests__/`) keep CLI regression suites nex
  to the code they exercise.
- Boot probes provide immediate environment diagnostics before the agent runs commands.
- Timeline view keeps the latest 20 events and the plan now renders beneath the AskHuman prompt, hiding completed steps to highlight remaining work.
- CLI bootstrap and core loader now pass TypeScript checks instead of being excluded via `@ts-nocheck`.
- Legacy console utilities (rendering, status lines, readline, thinking indicator) and their supporting helpers now participate in strict TypeScript checks, shrinking the surface still relying on `@ts-nocheck`.

## Risks / Gaps

- Ink rendering relies on Node terminal capabilities; ensure compatibility when adding components (use `progressUtils` helpers).
- Runner handles CLI flags parsed via `@asynkron/openagent-core` startup flag helpers—keep docs/code aligned when adding new flags.

## Related Context

- Core runtime powering the CLI: [`../../core/src/context.md`](../../core/src/context.md).
- Package overview: [`../context.md`](../context.md).

## Maintenance Notes

- Runtime event router includes a handler for `schema_validation_failed` to surface assistant schema issues as status entries.
- The plan view normalizes snapshot step IDs to strings when rendering (numeric IDs are coerced to strings) to align with local `PlanStep` contracts used by the UI helpers.
- Command log helpers tighten type guards around `exit_code` to satisfy strict TypeScript checks.
