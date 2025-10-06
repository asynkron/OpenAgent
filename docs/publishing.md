# Publishing OpenAgent to npm

This guide explains how the automated GitHub Actions workflow ships the `openagent` package to npm and how to fall back to a manual publish if needed.

## 1. Automated release pipeline

Two workflows collaborate to ship a release:

1. `.github/workflows/auto-release.yml` runs on every push to `main`. It bumps the version with `npm version minor`, pushes the
   commit and tag, then creates (or reuses) a GitHub Release for that tag.
2. `.github/workflows/publish.yml` reacts to the published release event and performs the npm publish.

Because of this split, **a push to `main` by itself does not talk to npm**. It only prepares the release; npm publication occurs
once the Release is published (either by the auto-release workflow or manually). If the tag already has a Release, the
auto-release workflow logs "Release vX.Y.Z already exists" and skips creation, so the publish workflow will not fire again
unless you manually rerun it via the `workflow_dispatch` input described below.

The publish workflow can be triggered in two ways:

1. **Release event** – create a GitHub Release whose tag matches the package version (for example, `v2.1.0`). Once the release is published the workflow runs automatically.
2. **Manual dispatch** – run the workflow from the _Actions_ tab and provide the tag (e.g. `v2.1.0`). Useful for dry runs or re-publishing a failed release after fixing infrastructure issues.

### Required secrets and permissions

- Create an npm automation token with publish rights and add it as the `NPM_TOKEN` repository secret.
- Grant the workflow OIDC permissions by keeping `id-token: write` enabled so `npm publish --provenance` can mint a provenance attestation.
- The workflow uses Node.js 20 and expects `npm ci`, `npm run lint`, and `npm test` to succeed before publishing.
- GitHub provenance is enabled (`npm publish --provenance`) so the repository must have GitHub Actions provenance configured (it is on by default for public repos).

### Release preparation checklist

Before triggering the workflow:

1. **Bump the package version** locally using `npm version <patch|minor|major>`. Commit and push the change (including the git tag that `npm version` creates).
2. **Update changelog and docs** with user-facing changes.
3. **Verify CI is green** on the branch you plan to tag.

The publish workflow enforces an extra guardrail by running `npm run release:verify-tag -- <tag>`. This script compares the git tag with `package.json` to prevent accidental mismatches.

### What the workflow does

1. Checks out the repository with full history so tags are available.
2. Installs dependencies via `npm ci`.
3. Runs linting (`npm run lint`) and tests (`npm test`).
4. Confirms the triggering tag matches the version in `package.json`.
5. Publishes to npm using the `NPM_TOKEN` secret.

If any step fails the publish halts, keeping the release from reaching npm.

### Troubleshooting publish failures

Publishing can fail even when the workflow runs to completion. Common causes include:

- **403 Forbidden from npm** – The `NPM_TOKEN` lacks permission to publish the `openagent` package. Confirm the token belongs to
  an npm account that is listed as a maintainer (`npm access ls-packages <user>`), or generate a fresh automation token from the
  correct org and update the `NPM_TOKEN` secret. GitHub Actions only authenticates to npm with this token—being a repo admin is
  not enough.
- **Tag/version mismatch** – `npm run release:verify-tag -- <tag>` fails when the git tag (for example `v2.2.0`) does not match
  `package.json`. Re-run `npm version` to regenerate the correct commit and tag.
- **Registry connectivity issues** – npm downtime or networking problems surface as `ETIMEDOUT`/`EAI_AGAIN` errors. Re-run the
  workflow once npm status is green.

All npm command output is captured in the workflow logs. When `npm publish` fails it writes the full log path (for example
`/home/runner/.npm/_logs/...-debug-0.log`); download that artifact for line-by-line details.

## 2. Manual publish (fallback)

If GitHub Actions is unavailable, you can still publish manually:

1. Run the quality gates locally:
   ```sh
   npm run lint
   npm test
   ```
2. Bump the version and push the commit and tag created by `npm version`.
3. Authenticate (`npm login`) with an account that has publish rights.
4. Publish using `npm publish --access public`.
5. Verify the new version on <https://www.npmjs.com/package/openagent> and update any release notes.

Manual publishes should be rare—prefer the automated pipeline so every release is reproducible and validated.
