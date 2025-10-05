# Directory Context: legacy/src/templates

## Purpose
- CommonJS helper for command templates, mirroring `src/templates/cli.js`.

## Key Module
- `cli.js`: loads `templates/command-templates.json`, renders templates, and implements `list/show/render` subcommands.

## Positive Signals
- Keeps legacy CLI consistent with ESM behaviour, including template variable interpolation.

## Risks / Gaps
- Requires manual updates after template API changes in the ESM implementation.

## Related Context
- ESM counterpart: [`../../../src/templates/context.md`](../../../src/templates/context.md)
