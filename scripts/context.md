# Directory Context: scripts

## Purpose

- Houses Node.js utilities executed from npm scripts and CI workflows.
- Provides guardrails for validating JSON assets and release automation inputs.

## Key Files

- `apply_patch`: applies "headerless" patches (OpenAI-style) by matching raw diff hunks without full context and reports changed files.
- `validate-json-assets.js`: validates `prompts/prompts.json` against `schemas/prompts.schema.json`, enforces unique IDs, and checks prompt copies stay in sync.
- `verify-release-tag.js`: ensures the git tag that triggered a release matches `package.json`'s version before publishing proceeds.

## Positive Signals

- Automated asset validation prevents schema drift before commits land.
- Release tagging check fails fast when CI is misconfigured, protecting npm publishes.

## Risks / Gaps

- Additional scripts should update this context and the npm script inventory in `package.json` when added.

## Related Context

- Schemas: [`../schemas/context.md`](../schemas/context.md)
- JSON validation utilities: [`../src/utils/context.md`](../src/utils/context.md)

### Helper scripts (developer tools)

- `rename-identifier.cjs`: scope-aware per-file renamer that renames a declaration and all references that resolve to it (respects lexical scoping and avoids renaming shadowed bindings). Dry-run prints a unified diff; use --apply to write changes and --check to run node --check after applying. Usage: `node scripts/rename-identifier.cjs --file path/to/file.js --old oldName --new newName [--index N] [--apply] [--check]`
