# Directory Context: src/commands

## Purpose

- Implements command execution primitives and specialized helpers the agent invokes (`run`, `read`, `edit`, `replace`, `browse`, string quoting, approvals, stats`).

## Notable Modules

- `run.js`: spawns shell commands with timeouts, cancellation hooks, stdin piping, and exposes re-exports for specialised helpers.
- `browse.js`: HTTP/HTTPS GET helper with optional global `fetch` fast path.
- `read.js`: streams file contents with path normalization and optional limits.
- `edit.js`: applies positional edits, creating files/directories as needed.
- `replace.js`: regex-based multi-file replacement with dry-run support.
- `escapeString.js`: implements `quote_string` / `unquote_string` built-ins via JSON stringification/parsing.
- `preapproval.js`: evaluates commands against allowlists and per-session approvals.
- `commandStats.js`: records command usage to XDG cache path.

## Positive Signals

- `run.js` cancellation integrates with `utils/cancellation`, ensuring process cleanup on timeouts/ESC.
- `replace.js` enforces `g` flag and supports dry-run reporting.
- `escapeString.js` centralises string coercion, enabling new built-ins without touching `loop.js` internals.

## Risks / Gaps

- `runBrowse` contains redundant networking logic; ideally rely solely on `fetch` with polyfill for Node <18.
- `preapproval.js` heuristics are regex-heavy and may miss emerging shell injection vectors.
- Lack of unit tests for `escapeString` helpers and `runBrowse` timeout edge cases.

## Related Context

- Consumed by agent loop: [`../agent/context.md`](../agent/context.md)
- Tests covering helpers: [`../../tests/unit/context.md`](../../tests/unit/context.md)
