# Directory Context: shortcuts

## Purpose

- Defines reusable CLI shortcuts consumed by `src/shortcuts/cli.js`.

## Key File

- `shortcuts.json`: array of shortcut objects (`id`, `name`, `command`, tags). Used for listing/showing/running shortcuts via CLI.

## Positive Signals

- Gives the agent and humans quick access to frequent commands (`npm test`, `eslint`).

## Risks / Gaps

- Missing documentation for how to add new shortcuts alongside templates.

## Related Context

- CLI handler: [`../src/shortcuts/context.md`](../src/shortcuts/context.md)
