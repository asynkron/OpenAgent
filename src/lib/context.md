# Directory Context: src/lib

## Purpose

- Provide a stable, CLI-agnostic aggregation layer around the agent runtime so the package can be consumed as a library.

## Modules

- `index.js`: re-exports command runners, prompt helpers, and startup flag utilities without owning CLI rendering concerns.
- `startupFlags.js`: centralises mutable startup flag state so the CLI runtime and library exports stay in sync.

## Notes

- Startup flags default to `false` and can be configured via `setStartupFlags`, `parseStartupFlagsFromArgv`, or `applyStartupFlagsFromArgv`.
- Consumers pick up individual flag helpers such as `getAutoApproveFlag`, `getNoHumanFlag`, `getPlanMergeFlag`, `getDebugFlag`, and `setNoHumanFlag` from `startupFlags.js`; the aggregated `startupFlagAccessors` object surfaces the same helpers (including `STARTUP_DEBUG`) to external callers, and the agent runtime now gates plan merging behind `getPlanMergeFlag`.
- The CLI runner (`../cli/runner.js`) is the only module responsible for parsing process arguments and invoking the CLI runtime.
