# Directory Context: src/commands

## Purpose & Scope
- Low-level primitives that execute shell commands and read files on behalf of the agent runtime.

## Key Files
- `run.js` — spawns shell commands with timeout/cancellation support, captures stdout/stderr to temp files, and exposes `runCommand` plus helper wrappers (uses `.openagent/temp`).
- `read.js` — performs filesystem reads based on structured specs (path, max bytes/lines) with encoding handling.
- `readSpec.js` — parses `read` command token syntax and merges specs.

## Positive Signals
- Command execution isolates side effects from the agent loop, simplifying testing via mocks.
- Read spec parsing supports both inline tokens and JSON payloads, giving prompts flexibility.

## Risks / Gaps
- Temporary command output directories accumulate under `.openagent/temp`; ensure cleanup on failures works across platforms.
- Shell execution assumes POSIX semantics; Windows support may need tweaks (e.g., quoting, default shell).

## Related Context
- Dispatcher using these primitives: [`../agent/context.md`](../agent/context.md).
- Tests covering behavior: [`../../tests/unit/context.md`](../../tests/unit/context.md), [`../../tests/integration/context.md`](../../tests/integration/context.md).
