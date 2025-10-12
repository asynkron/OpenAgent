# Directory Context: scripts

## Purpose & Scope

- Developer utilities for refactoring, asset validation, and release safety checks.

## Key Files

- `replace-node.cts` — thin wrapper that re-exports the compiled jscodeshift transform from `@asynkron/openagent-core`, keeping legacy CLI invocations working while the source lives alongside the core package.
- `start.ts` — orchestrates `npm start` modes. Defaults to the CLI but adds a `web` target that builds the frontend bundle before launching the web backend. Emits to `scripts/dist/start.js` during the root build.
- `validate-json-assets.ts` — validates prompt JSON against `schemas/prompts.schema.json`, guarding against schema drift. Compiled output lives under `scripts/dist/`.
- `verify-release-tag.ts` — ensures release tags align with package metadata before publishing (also compiled into `scripts/dist/`).
- `babel/plugins/replaceJsExtensions.cjs` — Babel helper used by Jest to rewrite the CLI's `.js`
  import specifiers (including dynamic `import()` calls) to `.ts` during test transforms so the
  TypeScript sources load without bundling.
- `README.md` & `patchexample.md` — documentation for the helper scripts (with updated paths pointing to `packages/core/scripts/`).

## Positive Signals

- Provides automation hooks that AI agents can leverage instead of writing ad-hoc scripts.
- JSON validation script is wired into tests, keeping prompts and schemas synchronized.
- Editing helpers now reside in [`../packages/core/scripts`](../packages/core/scripts) so they ship with the core runtime package.

## Risks / Gaps

- Some scripts rely on external CLIs (`jscodeshift`, etc.)—verify availability in constrained environments.
- No single entry point enumerates script dependencies; consult individual files before running.

## Related Context

- Prompt/schema interplay: [`../packages/core/prompts/context.md`](../packages/core/prompts/context.md), [`../schemas/context.md`](../schemas/context.md).
- Release workflows consuming these scripts: [`.github/workflows/context.md`](../.github/workflows/context.md).
