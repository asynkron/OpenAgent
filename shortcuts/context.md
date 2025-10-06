# Directory Context: shortcuts

## Purpose

- Defines reusable CLI shortcuts consumed by `src/shortcuts/cli.js`.

## Key Files

- `shortcuts.json`: array of shortcut objects (`id`, `name`, `command`, tags). Used for listing/showing/running shortcuts via CLI.
- Schema: [`../schemas/shortcuts.schema.json`](../schemas/shortcuts.schema.json) enforces structure during automated validation.

## Positive Signals

- Gives the agent and humans quick access to frequent commands (`npm test`, `eslint`).

## Risks / Gaps

- Missing documentation for how to add new shortcuts alongside templates.
- Keep shortcut identifiers unique; the validation step will fail fast on duplicates.

## Related Context

- CLI handler: [`../src/shortcuts/context.md`](../src/shortcuts/context.md)
