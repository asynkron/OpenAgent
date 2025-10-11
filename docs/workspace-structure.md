# Workspace & Package Naming Strategy

This note documents the workspace layout now used in the repository and how to keep the published CLI name stable as the packages evolve.

## Goals

1. Extract a reusable runtime (`core`) so non-CLI surfaces can consume the agent orchestration logic.
2. Keep the existing npm entry point (`@asynkron/openagent`) as the CLI to avoid breaking consumers.
3. Introduce new package names only where additional artifacts (e.g., the core library) must be published.

## Recommended Directory Layout

```
packages/
  core/         # exports the runtime API (`createAgent`, evaluators, hooks, etc.)
  cli/          # wraps the core with Ink / terminal UX and exposes the `openagent` binary
```

The repository root acts as an npm workspace so each package owns its own `package.json`. Runtime modules (`agent`, `commands`, `services`, `openai`, shared utilities) now live in `packages/core/src/`, while CLI-specific Ink components, bootstrapping, and the `bin/openagent.js` entry live in `packages/cli/`.

## npm Publishing Strategy

- **Keep the CLI name**: move the current package contents into `packages/cli` and leave its `package.json` as `"name": "@asynkron/openagent"`. Existing npm installs (`npm i -g @asynkron/openagent`) continue to resolve the CLI bundle.
- **Add the core as a new artifact** (optional): publish the shared runtime as `@asynkron/openagent-core` (or similar). Only consumers needing to embed the agent import this package.
- **Avoid duplicate publishes**: do not keep a top-level `package.json` once workspaces are enabled; the workspace root simply wires tooling (scripts, lint config) and defers publishing to the package-level manifests.
- **Versioning**: you can keep CLI and core in lockstep (same version numbers) by using a release script that bumps both manifests together, or version them independently if the runtime evolves faster than the UI. Pick one strategy early to prevent confusing release notes.

## Migration Checklist

1. **Enable workspaces**: update the root `package.json` with a `"workspaces": ["packages/*"]` field (or the equivalent for pnpm/Yarn) and move shared scripts/tooling there.
2. **Split source code**: relocate the runtime modules into `packages/core`, adjusting import paths and exports to provide a clean public API.
3. **Re-home the CLI**: copy Ink components and the binary bootstrap into `packages/cli`, pointing its dependency on `@asynkron/openagent-core` (or a relative path during migration).
4. **Update tests**: move unit tests alongside their packages. Leave any end-to-end CLI tests either in `packages/cli` or at the repo root if they span multiple packages.
5. **Verify publishing**: run a dry-run publish (`npm publish --dry-run`) from each package to ensure manifests include the right files and the CLI continues to expose the `openagent` binary.

This approach lets you evolve the runtime independently, keep existing users on the same CLI package, and only introduce new npm names when you decide to publish the extracted core.
