# Directory Context: packages/core/scripts

## Purpose & Scope

- Houses the built-in editing helpers (`apply_patch.mjs`, `edit-lines.mjs`, `read.mjs`, `rename-identifier.mjs`) that ship with the core runtime package.
- These scripts back the command normalizers in `src/commands/run.js`, ensuring assistant-issued `apply_patch` and `read` invocations resolve to known, safe implementations even when the CLI runs outside the repository root.

## Key Files

- `apply_patch.mjs` — applies headless patches emitted by language models, ignoring whitespace drift by default (toggleable with `--respect-whitespace`) while still falling back to whitespace-normalized matching after attempting an exact comparison and surfacing detailed reporting when hunks fail to match.
- `edit-lines.mjs` — targeted line replacement utility with dry-run/rollback safeguards.
- `read.mjs` — base64-encoded batch file reader used by the `read` command helper.
- `rename-identifier.mjs` — scope-aware identifier renamer for single-file refactors.
- `replace-node.ts` — jscodeshift entry point that now shells out to the `replace-node/` helper suite so option parsing, file loading, AST matching, and source rewriting stay independently testable.
- `replace-node/args.ts`, `replace-node/fileCache.ts`, `replace-node/matches.ts`, `replace-node/ranges.ts`, `replace-node/types.ts` — typed helpers that normalise CLI flags, cache replacement file contents, collect AST match ranges, convert location metadata into byte offsets, and expose a minimal jscodeshift type surface so the transform runs without `@ts-nocheck`.
- `gitpush.sh`, `gitpop.sh`, `gitdrop.sh` — git-stack helpers now installed with executable permissions plus `gitpush`, `gitpop`, `gitdrop` symlinks for command-style invocation.

## Related Context

- Command execution shim that rewrites built-in commands: [`../src/commands/run.js`](../src/commands/run.js).
- Legacy maintenance scripts that remain at the repo root: [`../../scripts/context.md`](../../scripts/context.md).
