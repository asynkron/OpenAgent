# Directory Context: src/commands

## Purpose

- Implements command execution primitives and specialized helpers the agent invokes (`run`, `read`, `edit`, `replace`, `browse`, string quoting, approvals, stats`).

## Notable Modules

- `run.js`: spawns shell commands with timeouts, cancellation hooks, stdin piping, and exposes re-exports for specialised helpers.
- `browse.js`: HTTP/HTTPS helper that now delegates to the shared `HttpClient`, enabling consistent timeout/abort handling across fetch and Node fallbacks.
- `read.js`: streams file contents with path normalization and optional limits.
- `readSpec.js`: parses shell-style `read` command invocations into normalized specs for the loop and tests.
- `edit.js`: applies positional edits, creating files/directories as needed.
- `replace.js`: regex-based multi-file replacement with dry-run support.
- `escapeString.js`: implements `quote_string` / `unquote_string` built-ins via JSON stringification/parsing.
- `preapproval.js`: evaluates commands against allowlists and per-session approvals.
- `commandStats.js`: records command usage to XDG cache path.

## Positive Signals

- `run.js` cancellation integrates with `utils/cancellation`, ensuring process cleanup on timeouts/ESC.
- `browse.js` now reuses the shared `HttpClient`, consolidating networking behaviour and improving testability.
- `replace.js` enforces `g` flag and supports dry-run reporting.
- `escapeString.js` centralises string coercion, enabling new built-ins without touching `loop.js` internals.
- `preapproval.js` validation now guards against risky shells/flags with dedicated unit coverage for new heuristics.

## Risks / Gaps

- `preapproval.js` heuristics remain regex-heavy; continue expanding allowlist fixtures as new command patterns appear.
- HttpClient centralises networking, but additional integration tests may be needed for non-GET verbs or custom headers.
- Run command safety still depends on human approvals; browser fetch remains limited to GET.

## Related Context

- Consumed by agent loop: [`../agent/context.md`](../agent/context.md)
- Tests covering helpers: [`../../tests/unit/context.md`](../../tests/unit/context.md)
