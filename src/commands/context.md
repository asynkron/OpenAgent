# Directory Context: src/commands

## Purpose

- Implements command execution primitives and built-in helpers the agent invokes (`run`, `read`, `apply_patch`).
- Approval/session tracking and command usage metrics now live under `src/services/`, keeping this directory focused on concrete command implementations.

## Notable Modules

- `run.js`: spawns shell commands with timeouts, cancellation hooks, stdin piping, and exposes re-exports for specialised helpers.
- `read.js`: streams file contents with path normalization and optional limits.
- `readSpec.js`: parses shell-style `read` command invocations into normalized specs for the loop and tests.
- `run.js`: now also exposes `runApplyPatch`, applying unified diffs directly via the `diff` library with filesystem safety guards.

## Positive Signals

- `run.js` cancellation integrates with `utils/cancellation`, ensuring process cleanup on timeouts/ESC.
- Command approval service (`../services/commandApprovalService.js`) continues to guard against risky shells/flags with dedicated unit coverage for new heuristics.
- Command usage tracker (`../services/commandStatsService.js`) persists telemetry atomically, keeping command analytics resilient across restarts.
- `run.js` focuses on shell execution and built-in helpers that remain supported (`read` and `apply_patch`).

## Risks / Gaps

- Command approval service heuristics remain regex-heavy; continue expanding allowlist fixtures as new command patterns appear.
- HttpClient centralises networking, but additional integration tests may be needed for non-GET verbs or custom headers.

## Related Context

- Consumed by agent loop: [`../agent/context.md`](../agent/context.md)
- Tests covering helpers: [`../../tests/unit/context.md`](../../tests/unit/context.md)
