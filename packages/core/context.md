# Directory Context: packages/core

## Purpose & Scope

- Workspace package that exposes the headless OpenAgent runtime without any CLI dependencies.
- Publishes the `@asynkron/openagent-core` module consumed by the CLI and other front-ends.

## Key Files

- `package.json` — package manifest declaring dependencies (including the type-only `@ai-sdk/provider` import), TypeScript build script, and export map pointing at the compiled `dist` entry.
- `index.ts` — entry point that re-exports the curated runtime surface from `src/lib` and now participates in TypeScript checking.
- `src/` — TypeScript implementation of the agent loop, OpenAI client adapters, services, and utilities. See [`src/context.md`](src/context.md).
- `tsconfig.json` — package-scoped compiler configuration that emits JavaScript and declaration files into `dist/` and pulls in the workspace `types/**/*.d.ts` stubs so optional SDK dependencies resolve during builds.
- `prompts/` — canonical system/developer guidance plus prompt manifest consumed by runtime configuration. See [`prompts/context.md`](prompts/context.md).
- `scripts/` — bundled helper utilities invoked by command normalizers. See [`scripts/context.md`](scripts/context.md).
- `services/commandStatsService.ts` now runs under TypeScript checking, ensuring the command usage tracker writes safely to disk across platforms.
- Shared runtime contracts live in [`../../contracts`](../../contracts/context.md); core modules import plan/command types from there to avoid duplicating interfaces.

## Related Context

- CLI workspace consuming these exports: [`../cli/context.md`](../cli/context.md).
- Root workspace overview: [`../../context.md`](../../context.md).

## Maintenance Notes

- JSON schema utilities import types from `@ai-sdk/provider`; keep its version aligned with `@ai-sdk/provider-utils` to avoid typing mismatches.
- Local unit suites import `@jest/globals`; the package declares it as a devDependency so builds do not rely on the root workspace for Jest helpers.
