# Directory Context: templates

## Purpose

- Stores canned command templates consumed by `src/templates/cli.js` for repeatable workflows.

## Key Files

- `command-templates.json`: defines template entries (`id`, `name`, `command`, `variables`, tags). Example: `install-deps` with optional `package` variable.
- Schema: [`../schemas/templates.schema.json`](../schemas/templates.schema.json) keeps the structure validated during automated checks.

## Positive Signals

- Encourages consistent command usage; variable defaults document expected arguments.

## Risks / Gaps

- Templates overlap conceptually with shortcuts; guidance on when to use each is missing.
- When adding templates remember to update tests if new required fields are introduced in the schema.

## Related Context

- CLI renderer: [`../src/templates/context.md`](../src/templates/context.md)
