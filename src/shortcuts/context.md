# Directory Context: src/shortcuts

## Purpose
- Implements the CLI glue for interacting with `shortcuts/shortcuts.json`.

## Key Module
- `cli.js`: exposes `loadShortcutsFile`, `findShortcut`, and `handleShortcutsCli` (list/show/run). Uses `process.exit` to mirror legacy behaviour.

## Positive Signals
- Simple JSON-driven shortcuts enable scripted reuse of common commands.

## Risks / Gaps
- Direct `process.exit` calls make the module side-effectful; difficult to reuse programmatically.
- No validation of command safety when executing shortcuts.

## Related Context
- Source data: [`../../shortcuts/context.md`](../../shortcuts/context.md)
- Templates CLI parallels: [`../templates/context.md`](../templates/context.md)
