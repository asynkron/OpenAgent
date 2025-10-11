# Directory Context: packages/core

## Purpose & Scope

- Workspace package that exposes the headless OpenAgent runtime without any CLI dependencies.
- Publishes the `@asynkron/openagent-core` module consumed by the CLI and other front-ends.

## Key Files

- `package.json` — package manifest declaring dependencies and export map.
- `index.js` — entry point that re-exports the curated runtime surface from `src/lib`.
- `src/` — implementation of the agent loop, OpenAI client adapters, services, and utilities. See [`src/context.md`](src/context.md).

## Related Context

- CLI workspace consuming these exports: [`../cli/context.md`](../cli/context.md).
- Root workspace overview: [`../../context.md`](../../context.md).
