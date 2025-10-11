# Directory Context: .github/workflows

## Purpose & Scope

- Defines GitHub Actions pipelines for continuous integration, release automation, and npm publishing.

## Key Workflows

- `test.yml` — runs the Jest test suite on pull requests and pushes.
- `auto-release.yml` — bumps the npm patch version on merges to `main`, tags releases, checks out the freshly created tag, and publishes directly to npm.
- `publish.yml` — fallback workflow to publish `@asynkron/openagent` to npm on release events or manual dispatch (skips if the version already exists).

## Positive Signals

- All release-related workflows gate on the same test checks used for PRs, so regressions are caught before publishing.
- Workflows request OIDC tokens only when needed, supporting provenance-enabled `npm publish` without long-lived secrets.

## Risks / Gaps

- Release automation assumes `npm version patch`; manual overrides require editing the workflow.
- No nightly smoke tests—issues that require runtime execution outside Jest could slip through.

## Related Context

- Parent automation overview: [`../context.md`](../context.md).
- Runtime release scripts: [`../../scripts/context.md`](../../scripts/context.md).
