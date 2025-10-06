# Directory Context: legacy/src/shortcuts

## Purpose
- Archived CLI helpers for managing `shortcuts/shortcuts.json`, reflecting the pre-ESM build.

## Key Module
- `cli.js`: loads shortcut definitions and handles `list/show/run` subcommands (invokes `process.exit` like ESM version).

## Positive Signals
- Offers historical reference for how shortcut commands behaved prior to the ESM-only runtime.

## Risks / Gaps
- Still relies on direct `process.exit` calls; treat it as documentation rather than executable code.

## Related Context
- Modern shortcuts CLI: [`../../../src/shortcuts/context.md`](../../../src/shortcuts/context.md)
