# Directory Context: packages/cli

## Purpose & Scope

- Workspace package that delivers the interactive CLI experience and publishes the `@asynkron/openagent` npm entry.
- Depends on `@asynkron/openagent-core` for the agent runtime and exposes Ink components plus the `openagent` binary.

## Key Files

- `package.json` — CLI manifest declaring the workspace dependency on the core runtime and binary entry. Now builds TypeScript s
  ources to `dist/` before executing.
- `tsconfig.json` — package-level compiler configuration that emits ESM output into `dist/` while preserving `.js` extensions fo
  r runtime interoperability.
- `index.ts` — package entry that re-exports the core runtime and surfaces CLI-specific helpers.
- `bin/openagent.ts` — executable shim invoked by `npx openagent` or global installs.
- `src/` — Ink components, boot probes, runtime wiring, and readline helpers written in TypeScript. See [`src/context.md`](src/c
  ontext.md).
- `src/loadCoreModule.ts` — resolves the core runtime dependency with a local fallback when the workspace link is missing.

## Related Context

- Core workspace providing the runtime: [`../core/context.md`](../core/context.md).
- CLI-specific documentation: [`../../docs/context.md`](../../docs/context.md).
