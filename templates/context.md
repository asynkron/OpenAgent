# Directory Context: templates

## Purpose
- Stores canned command templates consumed by `src/templates/cli.js` for repeatable workflows.

## Key File
- `command-templates.json`: defines template entries (`id`, `name`, `command`, `variables`, tags). Example: `install-deps` with optional `package` variable.

## Positive Signals
- Encourages consistent command usage; variable defaults document expected arguments.

## Risks / Gaps
- No schema validation—malformed entries cause runtime errors.
- Templates overlap conceptually with shortcuts; guidance on when to use each is missing.

## Related Context
- CLI renderer: [`../src/templates/context.md`](../src/templates/context.md)
