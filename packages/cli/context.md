# Directory Context: packages/cli

## Purpose & Scope

- Workspace package that delivers the interactive CLI experience and publishes the `@asynkron/openagent` npm entry.
- Depends on `@asynkron/openagent-core` for the agent runtime and exposes Ink components plus the `openagent` binary.

## Key Files

- `package.json` — CLI manifest declaring the workspace dependency on the core runtime and binary entry.
- `index.js` — package entry that re-exports the core runtime and surfaces CLI-specific helpers.
- `bin/openagent.js` — executable shim invoked by `npx openagent` or global installs.
- `src/` — Ink components, boot probes, runtime wiring, and readline helpers. See [`src/context.md`](src/context.md).

## Related Context

- Core workspace providing the runtime: [`../core/context.md`](../core/context.md).
- CLI-specific documentation: [`../../docs/context.md`](../../docs/context.md).
