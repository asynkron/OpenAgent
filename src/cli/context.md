# Directory Context: src/cli

## Purpose & Scope
- Implements the interactive terminal UI and runtime wiring for the CLI version of OpenAgent.

## Key Areas
- `components/` — Ink React components for rendering responses, plans, commands, status messages, and debug panels. See [`components/context.md`](components/context.md).
- `bootProbes/` — environment probes that detect toolchains (Node, Python, Git, etc.) and surface status in the CLI. See [`bootProbes/context.md`](bootProbes/context.md).
- `runner.js` & `runtime.js` — orchestrate CLI startup, configure the agent runtime, and pipe events into Ink.
- `render.js`, `status.js`, `thinking.js` — helper utilities for formatting markdown, plan progress, context usage, and spinner indicators.
- `io.js` — wraps readline/Ink input handling, exposing `askHuman` and ESC detection constants.

## Positive Signals
- Separation between runtime wiring and presentation components simplifies testing; many components have unit coverage.
- Boot probes provide immediate environment diagnostics before the agent runs commands.

## Risks / Gaps
- Ink rendering relies on Node terminal capabilities; ensure compatibility when adding components (use `progressUtils` helpers).
- Runner handles many CLI flags; keep `src/lib/startupFlags.js` and docs in sync when introducing new flags.

## Related Context
- Agent runtime emitting events: [`../agent/context.md`](../agent/context.md).
- Package exports reusing CLI helpers: [`../lib/context.md`](../lib/context.md).
