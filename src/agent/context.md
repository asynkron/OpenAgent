# Directory Context: src/agent

## Purpose

- Houses the conversational control loop that coordinates OpenAI calls, human approvals, and command execution.

## Key Modules

- `loop.js`: wires the CLI dependencies, manages readline/ESC state, and delegates each pass to `passExecutor.js`.
- `passExecutor.js`: performs an agent pass (OpenAI request, JSON parsing, plan updates, approvals, command execution, observation logging).

## Positive Signals

- Cancellation, approval, and execution logic are modular, improving test coverage.
- Rich logging/render hooks injected via dependency bag for easier testing/mocking.
- Maintains conversation history explicitly, facilitating reproducibility.

## Related Context

- CLI rendering invoked from here: [`../cli/context.md`](../cli/context.md)
- Command runners used for execution: [`../commands/context.md`](../commands/context.md)
- Approval rules source: [`../commands/context.md`](../commands/context.md)
- Tests exercising the loop: [`../../tests/integration/context.md`](../../tests/integration/context.md)
