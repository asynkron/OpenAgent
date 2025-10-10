# Directory Context: scripts

## Purpose & Scope

- Developer utilities for refactoring, asset validation, and release safety checks.

## Key Files

- `apply_patch.mjs`, `edit-lines.mjs`, `replace-node.js`, `rename-identifier.mjs` — codemod helpers for structured edits.
- `install-git-hooks.js` — configures `core.hooksPath` so local Git uses the repo's `.githooks` directory automatically. The script runs during `npm install`, `npm prepare`, and the lifecycle `pre*` scripts for lint, format, and test tasks.
- `read.mjs` — implements the filesystem reader invoked via the normalized `read` command helper.
- `validate-json-assets.js` — validates prompt JSON against `schemas/prompts.schema.json`.
- `verify-release-tag.js` — ensures release tags align with package metadata before publishing.
- `README.md` & `patchexample.md` — usage documentation and examples for scripted edits.

## Positive Signals

- Provides automation hooks that AI agents can leverage instead of writing ad-hoc scripts.
- JSON validation script is wired into tests, keeping prompts and schemas synchronized.

## Risks / Gaps

- Some scripts rely on external CLIs (`jscodeshift`, etc.)—verify availability in constrained environments.
- No single entry point enumerates script dependencies; consult individual files before running.

## Related Context

- Prompt/schema interplay: [`../prompts/context.md`](../prompts/context.md), [`../schemas/context.md`](../schemas/context.md).
- Release workflows consuming these scripts: [`.github/workflows/context.md`](../.github/workflows/context.md).
