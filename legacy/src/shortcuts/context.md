# Directory Context: legacy/src/shortcuts

## Purpose
- CommonJS CLI helpers for managing `shortcuts/shortcuts.json`.

## Key Module
- `cli.js`: loads shortcut definitions and handles `list/show/run` subcommands (invokes `process.exit` like ESM version).

## Positive Signals
- Provides CLI parity for the legacy entry point.

## Risks / Gaps
- Direct `process.exit` usage complicates testing; no abstraction between ESM and CJS variants.

## Related Context
- Modern shortcuts CLI: [`../../../src/shortcuts/context.md`](../../../src/shortcuts/context.md)
