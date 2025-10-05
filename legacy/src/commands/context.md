# Directory Context: legacy/src/commands

## Purpose
- CommonJS counterparts to the command execution helpers in `src/commands`.

## Modules
- `run.js`, `read.js`, `edit.js`, `replace.js`, `browse.js`, `commandStats.js`, `preapproval.js`.

## Positive Signals
- Provides compatibility for tooling still depending on `require()`.

## Risks / Gaps
- Code mirrored from ESM without automated sync—bugfixes can diverge.
- Lacks new utilities such as `escapeString` present in ESM (confirm before using legacy build).

## Related Context
- ESM implementation: [`../../../src/commands/context.md`](../../../src/commands/context.md)
