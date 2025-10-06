# Directory Context: legacy/src/commands

## Purpose
- Archived counterparts to the command execution helpers in `src/commands`, kept for historical comparison now that the runtime is pure ESM.

## Modules
- `run.js`, `read.js`, `edit.js`, `replace.js`, `browse.js`, `commandStats.js`, `preapproval.js`.

## Positive Signals
- Documents the previous command helper surface without promising ongoing compatibility.

## Risks / Gaps
- Snapshot may lag behind active helpers; do not treat it as a supported build.
- Newer utilities such as `escapeString` never landed here—call that out if referencing this directory.

## Related Context
- ESM implementation: [`../../../src/commands/context.md`](../../../src/commands/context.md)
