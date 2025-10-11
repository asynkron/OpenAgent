# Directory Context: packages/cli/src

## Purpose & Scope

- Implements the interactive terminal UI and runtime wiring for the CLI package.
- Depends on `@asynkron/openagent-core` for orchestration, startup flags, and shared utilities.

## Key Areas

- `components/` — Ink React components for rendering responses, plans, commands, status messages, and debug panels. See [`components/context.md`](components/context.md).
- `bootProbes/` — environment probes that detect toolchains (Node, Python, Git, etc.) and surface status in the CLI. See [`bootProbes/context.md`](bootProbes/context.md).
- `runner.js` & `runtime.js` — orchestrate CLI startup, validate required environment configuration (e.g., `OPENAI_API_KEY`), configure the agent runtime, and pipe events into Ink.
- `loadCoreModule.js` — dynamically resolves `@asynkron/openagent-core` and falls back to the local workspace copy when node_modules links are absent.
- `render.js`, `status.js`, `thinking.js` — helper utilities for formatting markdown, plan progress, context usage, and spinner indicators.
- `io.js` — wraps readline input handling, exposing `askHuman` and ESC detection constants.

## Positive Signals

- Separation between runtime wiring and presentation components simplifies testing; many components have unit coverage.
- Co-located `__tests__/` folders (e.g., under `components/`, `bootProbes/`, and `src/__tests__/`) keep CLI regression suites nex
  to the code they exercise.
- Boot probes provide immediate environment diagnostics before the agent runs commands.

## Risks / Gaps

- Ink rendering relies on Node terminal capabilities; ensure compatibility when adding components (use `progressUtils` helpers).
- Runner handles CLI flags parsed via `@asynkron/openagent-core` startup flag helpers—keep docs/code aligned when adding new flags.

## Related Context

- Core runtime powering the CLI: [`../../core/src/context.md`](../../core/src/context.md).
- Package overview: [`../context.md`](../context.md).
