# Directory Context: src/agent/commands

## Purpose

- Houses class-based implementations of the `ICommand` contract used by `commandExecution.js`.

## Key Files

- `ApplyPatchCommand.js`: normalizes `apply_patch` commands and pipes them through the git-backed runner.
- `BrowseCommand.js`: opens URLs using the browsing runner with validation.
- `EscapeStringCommand.js` / `UnescapeStringCommand.js`: proxy string transformation helpers.
- `ReadCommand.js`: merges inline token specs with structured read payloads before dispatch.
- `ExecuteCommand.js`: default shell execution fallback when no other command matches.

## Notes

- Each class is stateless; instances are recreated on every invocation for clarity.
- Tests continue to exercise behaviour through `executeAgentCommand` to keep the handler pipeline black-boxed.
- Legacy `edit`/`replace` helpers have now been removed entirely, leaving `apply_patch` as the primary file-modification path.
