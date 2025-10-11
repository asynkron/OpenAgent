# Directory Context: src/agent/commands

## Purpose & Scope

- Command handler strategy objects used by `commandExecution.js` to satisfy agent-issued commands.

## Key Files

- `ExecuteCommand.js` — default handler that shells out via `runCommand` once `commandExecution.js` normalizes built-in helpers like `read`.

## Positive Signals

- Normalization happens upstream so the execute strategy can focus on shell invocation and reporting.

## Risks / Gaps

- Handler surface is intentionally narrow; coordinate with `commandExecution.js` if introducing additional built-ins.

## Related Context

- Dispatcher implementation: [`../commandExecution.js`](../commandExecution.js).
- Shell/read primitives: [`../../commands/context.md`](../../commands/context.md).
