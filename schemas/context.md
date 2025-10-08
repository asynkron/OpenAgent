# Directory Context: schemas

## Purpose & Scope

- JSON Schema definitions validating prompt bundles and other structured assets.

## Key Files

- `prompts.schema.json` — schema for `prompts/prompts.json`; ensures prompt metadata matches runtime expectations (e.g., required fields, allowed command types).

## Positive Signals

- Schema is consumed by `scripts/validate-json-assets.js` and Jest tests, catching prompt regressions early.

## Risks / Gaps

- Only the prompts schema lives here; if more structured assets are added, extend the schema collection and associated tooling.

## Related Context

- Prompt payloads: [`../prompts/context.md`](../prompts/context.md).
- JSON validation utility: [`../scripts/context.md`](../scripts/context.md).
