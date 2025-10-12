# Directory Context: packages/cli/src

## Purpose & Scope

- Implements the interactive terminal UI and runtime wiring for the CLI package.
- Depends on `@asynkron/openagent-core` for orchestration, startup flags, and shared utilities.

## Key Areas

- `components/` — Ink React components for rendering responses, plans, commands, status messages, and debug panels. All runtime files now ship as TypeScript modules. See [`components/context.md`](components/context.md).
- `bootProbes/` — environment probes that detect toolchains (Node, Python, Git, etc.) and surface status in the CLI. Probes compile to ESM in `dist/`. See [`bootProbes/context.md`](bootProbes/context.md).
- `runner.ts` & `runtime.ts` — orchestrate CLI startup, validate required environment configuration (e.g., `OPENAI_API_KEY`), configure the agent runtime, and pipe events into Ink with typed IO utilities.
- `loadCoreModule.ts` — dynamically resolves `@asynkron/openagent-core`, falls back to the local workspace copy when `node_modules` links are absent, and now guards against missing exports at runtime.
- `render.ts`, `status.ts`, `thinking.ts` — helper utilities for formatting markdown, plan progress, context usage, and spinner indicators.
- `io.ts` — wraps readline input handling, exposing `askHuman` and ESC detection constants.

## Positive Signals

- Separation between runtime wiring and presentation components simplifies testing; many components have unit coverage.
- Co-located `__tests__/` folders (e.g., under `components/`, `bootProbes/`, and `src/__tests__/`) keep CLI regression suites nex
  to the code they exercise.
- Boot probes provide immediate environment diagnostics before the agent runs commands.
- Timeline view keeps the latest 20 events and the plan now renders beneath the AskHuman prompt, hiding completed steps to highlight remaining work.
- CLI bootstrap and core loader now pass TypeScript checks instead of being excluded via `@ts-nocheck`.

## Risks / Gaps

- Ink rendering relies on Node terminal capabilities; ensure compatibility when adding components (use `progressUtils` helpers).
- Runner handles CLI flags parsed via `@asynkron/openagent-core` startup flag helpers—keep docs/code aligned when adding new flags.

## Related Context

- Core runtime powering the CLI: [`../../core/src/context.md`](../../core/src/context.md).
- Package overview: [`../context.md`](../context.md).
