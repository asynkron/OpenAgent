# Directory Context: src/agent/commands

## Purpose

- Houses class-based implementations of the `ICommand` contract used by `commandExecution.js`.

## Key Files

- `ReadCommand.js`: merges inline token specs with structured read payloads before dispatch.
- `ExecuteCommand.js`: default shell execution fallback when no other command matches.

## Notes

- Each class is stateless; instances are recreated on every invocation for clarity.
- Tests continue to exercise behaviour through `executeAgentCommand` to keep the handler pipeline black-boxed.
