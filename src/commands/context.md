# Directory Context: src/commands

## Purpose

- Implements command execution primitives and built-in helpers the agent invokes (`run`, `read`, `apply_patch`, `browse`, string quoting).
- Approval/session tracking and command usage metrics now live under `src/services/`, keeping this directory focused on concrete command implementations.

## Notable Modules

- `run.js`: spawns shell commands with timeouts, cancellation hooks, stdin piping, and exposes re-exports for specialised helpers.
- `browse.js`: HTTP/HTTPS helper that now delegates to the shared `HttpClient`, enabling consistent timeout/abort handling across fetch and Node fallbacks.
- `read.js`: streams file contents with path normalization and optional limits.
- `readSpec.js`: parses shell-style `read` command invocations into normalized specs for the loop and tests.
- `run.js`: now also exposes `runApplyPatch`, piping unified diff payloads through `git apply` with safety guards.
- `escapeString.js`: implements `quote_string` / `unquote_string` built-ins via JSON stringification/parsing.

## Positive Signals

- `run.js` cancellation integrates with `utils/cancellation`, ensuring process cleanup on timeouts/ESC.
- `browse.js` now reuses the shared `HttpClient`, consolidating networking behaviour and improving testability.
- `escapeString.js` centralises string coercion, enabling new built-ins without touching `loop.js` internals.
- Command approval service (`../services/commandApprovalService.js`) continues to guard against risky shells/flags with dedicated unit coverage for new heuristics.
- Command usage tracker (`../services/commandStatsService.js`) persists telemetry atomically, keeping command analytics resilient across restarts.
- `run.js` focuses on shell execution and built-in helpers that remain supported (`browse`, `read`, escape utilities, and `apply_patch`).

## Risks / Gaps

- Command approval service heuristics remain regex-heavy; continue expanding allowlist fixtures as new command patterns appear.
- HttpClient centralises networking, but additional integration tests may be needed for non-GET verbs or custom headers.
- Run command safety still depends on human approvals; browser fetch remains limited to GET.

## Related Context

- Consumed by agent loop: [`../agent/context.md`](../agent/context.md)
- Tests covering helpers: [`../../tests/unit/context.md`](../../tests/unit/context.md)
