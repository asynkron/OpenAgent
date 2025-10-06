# Directory Context: src/shortcuts

## Purpose

- Implements the CLI glue for interacting with `shortcuts/shortcuts.json`.

## Key Module

- `cli.js`: exposes `loadShortcutsFile`, `findShortcut`, and `handleShortcutsCli` (list/show/run). Uses `process.exit` to mirror legacy behaviour.

## Positive Signals

- Simple JSON-driven shortcuts enable scripted reuse of common commands.
- Loader now filters malformed entries, reducing the risk of executing arbitrary payloads.
- Companion schema (`schemas/shortcuts.schema.json`) captures the expected shape for future automated validation.

## Risks / Gaps

- Direct `process.exit` calls make the module side-effectful; difficult to reuse programmatically.

## Related Context

- Source data: [`../../shortcuts/context.md`](../../shortcuts/context.md)
- Templates CLI parallels: [`../templates/context.md`](../templates/context.md)
