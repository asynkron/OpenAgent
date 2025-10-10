# Frequently Asked Questions

## How do I keep prompts in sync?

Run `npm run scripts:sync-prompts`, commit the updated prompt files, and confirm the changes with `git diff`. See [docs/prompt-maintenance.md](./prompt-maintenance.md) for the full workflow.

## Where do I document architectural changes?

Update the closest directory `context.md` and reflect the change in the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix. Major operational shifts also belong in [docs/ops-overview.md](./ops-overview.md).

## What tests must pass before merging?

- `npm run lint`
- `npm test`
- Schema validation (part of the test suite) whenever prompts, templates, or shortcuts change.

## How do I enable the repo's Git hooks?

The hooks live in `.githooks/` and are opt-in. Point Git at that directory once per clone:

```bash
git config core.hooksPath .githooks
```

From then on, every `git commit` runs the bundled `pre-commit` hook, which calls `lint-staged` so only staged files are auto-formatted (`prettier --write`) and linted (`eslint --fix`). If you ever need to run the same cleanup manually, use `npx lint-staged` or the broader `npm run format` / `npm run lint` scripts.

## How often should I audit documentation?

Follow the cadence in [docs/ops-overview.md](./ops-overview.md): weekly spot-checks and monthly full audits of context indexes and cross-links.

## Who to contact for urgent issues?

Escalate to the maintainer-on-call via `#openagent-maintainers` with logs, reproduction steps, and any mitigation actions already taken.

## Where can I find implementation hotspots quickly?

Consult the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix for direct links to relevant code modules.
