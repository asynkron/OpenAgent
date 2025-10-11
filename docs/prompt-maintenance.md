# Prompt Maintenance Guide

## Purpose

Document the lifecycle for updating prompts, syncing their copies, and validating them against project safeguards.

## Update Workflow

1. Identify the need for change (bug report, feature, or experiment).
2. Edit the canonical prompt source under `packages/core/prompts/`.
3. Run the prompt sync script: `npm run scripts:sync-prompts`.
4. Execute schema validation: `npm test -- --runTestsByPath tests/json-schema.test.js`.
5. Update any mirrored copies in `brain/` or `docs/` using the sync script output.
6. Record the change in the nearest `context.md` and mention cross-links in `docs/docs-crosslinks.md`.

## Maintaining Prompt Copies and Context Indexes

1. Run `npm run scripts:sync-prompts` to refresh `packages/core/prompts/` and mirrored assets under `brain/` and `docs/`.
2. Inspect the generated copies with `git diff` and update narrative docs when wording changes.
3. Update the relevant `context.md` files to record intent and add new entries to `docs/docs-crosslinks.md`.
4. When introducing a new prompt family, confirm `packages/core/prompts/context.md` and `docs/context-indexing.md` describe ownership and sync expectations.

## Validation Checklist

- ✅ Schema validation passes for prompts, templates, and shortcuts.
- ✅ No lint failures in modified files.
- ✅ Prompt copies match the canonical source (run `git diff` to confirm).
- ✅ Documentation references are updated: context indexes, FAQ, and operational runbooks.

## Rollback Strategy

- Keep previous prompt versions tagged via `git tag prompt-v<date>` before major revisions.
- Revert using `git checkout <tag> -- packages/core/prompts/<file>` if regressions surface.
- Notify maintainers via `#openagent-maintainers` with details and next steps.

## Related Resources

- [docs/context-indexing.md](./context-indexing.md)
- [docs/docs-crosslinks.md](./docs-crosslinks.md)
- [docs/ops-overview.md](./ops-overview.md)
