# Directory Context: schemas

## Purpose

- Houses JSON Schema definitions for validating repository assets (prompts, templates, shortcuts).
- Enables automated checks to keep structured configuration files consistent.

## Key Files

- `prompts.schema.json`: Manifest structure describing canonical prompt files and their synchronized copies.
- `templates.schema.json`: Schema for CLI command templates consumed by the templates subcommand.
- `shortcuts.schema.json`: Schema for shortcut definitions exposed via the shortcuts CLI.

## Positive Signals

- Schemas allow CI/startup validation to fail fast on malformed JSON or missing prompt copies.

## Risks / Gaps

- Keep schemas in sync with runtime expectations whenever the asset formats evolve.

## Related Context

- Validation utilities: [`../src/utils/context.md`](../src/utils/context.md)
- CLI assets: [`../templates/context.md`](../templates/context.md), [`../shortcuts/context.md`](../shortcuts/context.md)
- Prompt guidance: [`../prompts/context.md`](../prompts/context.md)
