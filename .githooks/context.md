# Directory Context: .githooks

## Purpose & Scope

- Local Git hooks shipped with the repo. Developers can symlink this directory to `.git/hooks` to enforce custom checks.

## Key Scripts

- `pre-commit` — runs `lint-staged` to apply Prettier/ESLint fixes to staged files before commit.
- `pre-push` — verifies `npm run format:check` passes so pushes only proceed with repository-wide formatting.
- `scripts/install-git-hooks.js` — automatically wires `core.hooksPath` to this directory during install, `prepare`, and the lifecycle `pre*` scripts for lint, format, and test tasks so hooks stay active for agents and humans.

## Positive Signals

- Encourages running focused Jest subsets before commit, reducing flaky pushes.

## Risks / Gaps

- Running repository-wide formatting checks on every push may add latency to large pushes.

## Related Context

- Parent overview: [`../context.md`](../context.md).
- CI mirror of checks: [`.github/workflows/test.yml`](../.github/workflows/context.md).
