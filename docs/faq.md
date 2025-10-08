# Frequently Asked Questions

## How do I keep prompts in sync?
Run `npm run scripts:sync-prompts`, commit the updated prompt files, and confirm the changes with `git diff`. See [docs/prompt-maintenance.md](./prompt-maintenance.md) for the full workflow.

## Where do I document architectural changes?
Update the closest directory `context.md` and reflect the change in the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix. Major operational shifts also belong in [docs/ops-overview.md](./ops-overview.md).

## What tests must pass before merging?
- `npm run lint`
- `npm test`
- Schema validation (part of the test suite) whenever prompts, templates, or shortcuts change.

## How often should I audit documentation?
Follow the cadence in [docs/ops-overview.md](./ops-overview.md): weekly spot-checks and monthly full audits of context indexes and cross-links.

## Who to contact for urgent issues?
Escalate to the maintainer-on-call via `#openagent-maintainers` with logs, reproduction steps, and any mitigation actions already taken.

## Where can I find implementation hotspots quickly?
Consult the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix for direct links to relevant code modules.

