# Directory Context: src/commands

## Purpose & Scope

- Low-level primitives that execute shell commands and read files on behalf of the agent runtime.

## Key Files

- `run.js` — spawns shell commands with timeout/cancellation support, captures stdout/stderr to temp files, and exposes `runCommand` plus helper wrappers (uses `.openagent/temp`) while assuming upstream normalization has produced a string command and rejecting any other shape.
- `read.js` — normalizes `read` run strings into `node scripts/read.mjs` invocations and exposes helpers to decode embedded specs.
- `readSpec.js` — parses `read` command token syntax and merges specs.

## Positive Signals

- Command execution isolates side effects from the agent loop, simplifying testing via mocks.
- Read spec parsing helpers keep CLI displays accurate while delegating filesystem access to `scripts/read.mjs`.
- `run.js` ensures cancellation handlers are unregistered during all completion paths to avoid dangling callbacks.
- `run.js` rewrites legacy `apply_patch` invocations to the bundled `scripts/apply_patch.mjs` shim so models can continue using the
  familiar command while we control the implementation.

## Risks / Gaps

- Temporary command output directories accumulate under `.openagent/temp`; ensure cleanup on failures works across platforms.
- Shell execution assumes POSIX semantics; Windows support may need tweaks (e.g., quoting, default shell).

## Related Context

- Dispatcher using these primitives: [`../agent/context.md`](../agent/context.md).
- Tests covering behavior: [`../../tests/unit/context.md`](../../tests/unit/context.md), [`../../tests/integration/context.md`](../../tests/integration/context.md).
