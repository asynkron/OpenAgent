# Directory Context: legacy/src/templates

## Purpose
- Archived helper for command templates, mirroring `src/templates/cli.js` from before the pure-ESM transition.

## Key Module
- `cli.js`: loads `templates/command-templates.json`, renders templates, and implements `list/show/render` subcommands.

## Positive Signals
- Provides historical context for how template rendering evolved alongside the modern ESM helper.

## Risks / Gaps
- Snapshot requires manual updates after template API changes; do not rely on it for runtime behaviour.

## Related Context
- ESM counterpart: [`../../../src/templates/context.md`](../../../src/templates/context.md)
