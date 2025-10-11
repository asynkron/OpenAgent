# Directory Context: src/commands

## Purpose & Scope

- Low-level primitives that execute shell commands on behalf of the agent runtime.

## Key Files

- `run.js` — spawns shell commands with timeout/cancellation support, captures stdout/stderr to temp files, and exposes `runCommand` plus helper wrappers (uses `.openagent/temp`) while assuming upstream normalization has produced a string command and rejecting any other shape.

## Positive Signals

- Command execution isolates side effects from the agent loop, simplifying testing via mocks.
- `run.js` ensures cancellation handlers are unregistered during all completion paths to avoid dangling callbacks.
- `run.js` rewrites legacy `apply_patch` and `read` invocations to the bundled helpers under `packages/core/scripts/`, keeping the
  command surface stable while pointing to vetted implementations even when the working directory changes.

## Risks / Gaps

- Temporary command output directories accumulate under `.openagent/temp`; ensure cleanup on failures works across platforms.
- Shell execution assumes POSIX semantics; Windows support may need tweaks (e.g., quoting, default shell).

## Related Context

- Dispatcher using these primitives: [`../agent/context.md`](../agent/context.md).
- Tests covering behavior: [`__tests__/runCommand.test.js`](__tests__/runCommand.test.js), [`../../tests/integration/context.md`](../../tests/integration/context.md).
