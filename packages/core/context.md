# Directory Context: packages/core

## Purpose & Scope

- Workspace package that exposes the headless OpenAgent runtime without any CLI dependencies.
- Publishes the `@asynkron/openagent-core` module consumed by the CLI and other front-ends.

## Key Files

- `package.json` — package manifest declaring dependencies, TypeScript build script, and export map pointing at the compiled `dist` entry.
- `index.ts` — entry point that re-exports the curated runtime surface from `src/lib`.
- `src/` — TypeScript implementation of the agent loop, OpenAI client adapters, services, and utilities. See [`src/context.md`](src/context.md).
- `tsconfig.json` — package-scoped compiler configuration that emits JavaScript and declaration files into `dist/`.
- `prompts/` — canonical system/developer guidance plus prompt manifest consumed by runtime configuration. See [`prompts/context.md`](prompts/context.md).
- `scripts/` — bundled helper utilities invoked by command normalizers. See [`scripts/context.md`](scripts/context.md).

## Related Context

- CLI workspace consuming these exports: [`../cli/context.md`](../cli/context.md).
- Root workspace overview: [`../../context.md`](../../context.md).
