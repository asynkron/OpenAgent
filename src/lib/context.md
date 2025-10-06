# Directory Context: src/lib

## Purpose

- Provide a stable, CLI-agnostic aggregation layer around the agent runtime so the package can be consumed as a library.

## Modules

- `index.js`: re-exports command runners, prompt helpers, and startup flag utilities while wiring the agent loop used by the CLI.

## Notes

- Startup flags default to `false` and can be configured via `setStartupFlags`, `parseStartupFlagsFromArgv`, or `applyStartupFlagsFromArgv`.
- The CLI runner (`../cli/runner.js`) is the only module responsible for parsing process arguments and invoking `agentLoop()`.
