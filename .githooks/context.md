# Directory Context: .githooks

## Purpose & Scope
- Local Git hooks shipped with the repo. Developers can symlink this directory to `.git/hooks` to enforce custom checks.

## Key Scripts
- `pre-commit` — runs `npm run lint` and `npm run test -- --bail --findRelatedTests` to block commits that break lint rules or related Jest suites.

## Positive Signals
- Encourages running focused Jest subsets before commit, reducing flaky pushes.

## Risks / Gaps
- Hook is opt-in; contributors must manually configure Git to use it.
- Running lint/tests on every commit can be slow for large change sets; consider using `SKIP_PRECOMMIT` env var if documented.

## Related Context
- Parent overview: [`../context.md`](../context.md).
- CI mirror of checks: [`.github/workflows/test.yml`](../.github/workflows/context.md).
