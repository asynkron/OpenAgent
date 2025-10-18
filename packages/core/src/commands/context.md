# Directory Context: src/commands

## Purpose & Scope

- Low-level primitives that execute shell commands on behalf of the agent runtime.

## Key Files

- `run.ts` — spawns shell commands with timeout/cancellation support, captures stdout/stderr to temp files, exposes the canonical `CommandResult` interface (alongside its partial variant), and delegates lifecycle wiring to the `CommandExecution` coordinator so cancellation/timeouts/cleanup paths stay isolated from the `runCommand` entry point.
- `commandHelpers.ts` — normalizes optional labels/descriptions for logging, expects string inputs from callers, and appends new command output lines while preserving existing formatting.
- `commandExecution.ts` — orchestrates the command execution pipeline by creating a state container and delegating to the lifecycle helpers.
- `commandExecutionLifecycle.ts` — drives the actual child-process lifecycle (stdin wiring, cancellation callbacks, timeout escalation, cleanup).
- `commandExecutionTypes.ts` — centralizes the execution state contracts shared between the orchestrator and lifecycle helpers.
- `commandTypes.ts` — houses the shared `RunOptions`, `CommandResult`, and `PartialCommandResult` interfaces used by command helpers and consumers.

## Positive Signals

- Command execution isolates side effects from the agent loop, simplifying testing via mocks.
- `run.ts` ensures cancellation handlers are unregistered during all completion paths to avoid dangling callbacks.
- `run.ts` rewrites legacy `apply_patch` and `read` invocations to the bundled helpers under `packages/core/scripts/`, keeping the
  command surface stable while pointing to vetted implementations even when the working directory changes.
- `tempFileManager.ts` handles numeric file descriptors directly and still guards against close failures, so resource cleanup
  remains safe even if the OS rejects the `closeSync` call.

## Risks / Gaps

- Temporary command output directories accumulate under `.openagent/temp`; ensure cleanup on failures works across platforms.
- Shell execution assumes POSIX semantics; Windows support may need tweaks (e.g., quoting, default shell).

## Related Context

- Dispatcher using these primitives: [`../agent/context.md`](../agent/context.md).
- Tests covering behavior: [`__tests__/runCommand.test.js`](__tests__/runCommand.test.js), [`../../tests/integration/context.md`](../../tests/integration/context.md).
