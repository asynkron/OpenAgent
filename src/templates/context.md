# Directory Context: src/templates

## Purpose

- CLI handlers for command templates defined in `templates/command-templates.json`.

## Key Module

- `cli.js`: exposes `loadTemplates`, `renderTemplateCommand`, `handleTemplatesCli` (list/show/render). Performs simple `{{var}}` interpolation with defaults.

## Positive Signals

- Enables reusable command scaffolds with variable substitution, useful for repeated workflows.
- Loader sanitises JSON payloads to strip malformed entries before rendering.

## Risks / Gaps

- Uses plain regex replacement—no escaping, so braces inside commands require care.
- Like shortcuts, relies on `process.exit`, reducing composability.

## Related Context

- Template data: [`../../templates/context.md`](../../templates/context.md)
