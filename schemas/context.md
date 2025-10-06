# Directory Context: schemas

## Purpose

- Houses JSON Schema definitions for validating repository assets (currently prompts).
- Enables automated checks to keep structured configuration files consistent.

## Key Files

- `prompts.schema.json`: Manifest structure describing canonical prompt files and their synchronized copies.

## Positive Signals

- Schemas allow CI/startup validation to fail fast on malformed JSON or missing prompt copies.

## Risks / Gaps

- Keep schemas in sync with runtime expectations whenever the asset formats evolve.

## Related Context

- Validation utilities: [`../src/utils/context.md`](../src/utils/context.md)
- Prompt guidance: [`../prompts/context.md`](../prompts/context.md)
