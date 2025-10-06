# Directory Context: src/agent/commands

## Purpose

- Houses class-based implementations of the `ICommand` contract used by `commandExecution.js`.

## Key Files

- `BrowseCommand.js`: opens URLs using the browsing runner with validation.
- `EditCommand.js`: wraps structured `edit` payloads.
- `EscapeStringCommand.js` / `UnescapeStringCommand.js`: proxy string transformation helpers.
- `ReadCommand.js`: merges inline token specs with structured read payloads before dispatch.
- `ReplaceCommand.js`: applies structured text replacements.
- `ExecuteCommand.js`: default shell execution fallback when no other command matches.

## Notes

- Each class is stateless; instances are recreated on every invocation for clarity.
- Tests continue to exercise behaviour through `executeAgentCommand` to keep the handler pipeline black-boxed.
