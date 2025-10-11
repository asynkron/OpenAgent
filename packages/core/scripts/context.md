# Directory Context: packages/core/scripts

## Purpose & Scope

- Houses the built-in editing helpers (`apply_patch.mjs`, `edit-lines.mjs`, `read.mjs`, `rename-identifier.mjs`) that ship with the core runtime package.
- These scripts back the command normalizers in `src/commands/run.js`, ensuring assistant-issued `apply_patch` and `read` invocations resolve to known, safe implementations even when the CLI runs outside the repository root.

## Key Files

- `apply_patch.mjs` — applies headless patches emitted by language models.
- `edit-lines.mjs` — targeted line replacement utility with dry-run/rollback safeguards.
- `read.mjs` — base64-encoded batch file reader used by the `read` command helper.
- `rename-identifier.mjs` — scope-aware identifier renamer for single-file refactors.

## Related Context

- Command execution shim that rewrites built-in commands: [`../src/commands/run.js`](../src/commands/run.js).
- Legacy maintenance scripts that remain at the repo root: [`../../scripts/context.md`](../../scripts/context.md).
