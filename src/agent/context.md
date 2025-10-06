# Directory Context: src/agent

## Purpose

- Houses the conversational control loop that coordinates OpenAI calls, human approvals, and command execution.

## Key Modules

- `loop.js`: wires CLI dependencies, delegating ESC wiring to `escState.js` and the greeting handshake to `handshake.js` before deferring passes to `passExecutor.js`.
- `handshake.js`: encapsulates the temporary history injection used for the initial system handshake.
- `escState.js`: centralises ESC event wiring, waiter management, and reset helpers for cancellation propagation.
- `passExecutor.js`: performs an agent pass (OpenAI request, JSON parsing, plan updates, approvals, command execution, observation logging).
- `historyCompactor.js`: auto-compacts older history entries when context usage exceeds the configured threshold by summarizing them into long-term memory snapshots.
- `commandExecution.js`: routes assistant commands to the correct runner (edit/read/browse/escape/etc.) and ensures built-ins are interpreted before falling back to shell execution.

## Positive Signals

- Cancellation, approval, and execution logic are modular, improving test coverage.
- Rich logging/render hooks injected via dependency bag for easier testing/mocking.
- Maintains conversation history explicitly, facilitating reproducibility.
- OpenAI invocations now lean on the shared helper in `openai/responses.js`, keeping reasoning configuration consistent.
- History compaction prints the generated summary to the CLI so humans can keep track of the active intent.
- Initial handshake with the model occurs before reading human input, giving the agent a chance to greet and summarize readiness automatically.

## Related Context

- CLI rendering invoked from here: [`../cli/context.md`](../cli/context.md)
- Command runners used for execution: [`../commands/context.md`](../commands/context.md)
- Approval rules source: [`../commands/context.md`](../commands/context.md)
- Tests exercising the loop: [`../../tests/integration/context.md`](../../tests/integration/context.md)
