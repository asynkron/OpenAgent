# Directory Context: src/agent/commands

## Purpose & Scope

- Command handler strategy objects used by `commandExecution.js` to satisfy agent-issued commands.

## Key Files

- `ReadCommand.js` — detects `read` commands (either via `run` keyword or explicit `command.read`) and merges tokenized specs with structured payloads before delegating to `runRead`.
- `ExecuteCommand.js` — fallback handler that shells out via `runCommand` for any other requests.

## Positive Signals

- Read handler merges CLI token specs with JSON payloads, enabling flexible prompt outputs while still validating paths.
- Strategy pattern keeps command execution extensible without bloating the dispatcher.

## Risks / Gaps

- Only two handlers exist; add specialized commands (e.g., HTTP requests) carefully and update tests.
- Error messaging for missing `read` paths is minimal; consider surfacing richer context to the model.

## Related Context

- Dispatcher implementation: [`../commandExecution.js`](../commandExecution.js).
- Shell/read primitives: [`../../commands/context.md`](../../commands/context.md).
