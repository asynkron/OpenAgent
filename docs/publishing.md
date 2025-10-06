# Publishing OpenAgent to npm

This guide explains how the automated GitHub Actions workflow ships the `openagent` package to npm and how to fall back to a manual publish if needed.

## 1. Automated release pipeline

We publish via `.github/workflows/publish.yml`. The workflow can be triggered in two ways:

1. **Release event** – create a GitHub Release whose tag matches the package version (for example, `v2.1.0`). Once the release is published the workflow runs automatically.
2. **Manual dispatch** – run the workflow from the *Actions* tab and provide the tag (e.g. `v2.1.0`). Useful for dry runs or re-publishing a failed release after fixing infrastructure issues.

### Required secrets and permissions

- Create an npm automation token with publish rights and add it as the `NPM_TOKEN` repository secret.
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
