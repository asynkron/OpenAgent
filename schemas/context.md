# Directory Context: schemas

## Purpose

- Houses JSON Schema documents that describe the structure of workspace configuration assets (templates, shortcuts, prompts).

## Key Files

- `templates.schema.json`: authoritative description for entries in `templates/command-templates.json`.
- `shortcuts.schema.json`: mirrors the expected shape of `shortcuts/shortcuts.json`.
- `prompts.schema.json`: draft metadata schema to support future prompt sync tooling.

## Notes

- Validation tooling is not yet wired to these schemas; subsequent todo items will integrate them into CI/startup checks.
- Schemas follow the 2020-12 JSON Schema draft to align with modern tooling (Ajv, Spectral, etc.).
