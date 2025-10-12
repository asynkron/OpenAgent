# Directory Context: packages/cli

## Purpose & Scope

- Workspace package that delivers the interactive CLI experience and publishes the `@asynkron/openagent` npm entry.
- Depends on `@asynkron/openagent-core` for the agent runtime and exposes Ink components plus the `openagent` binary.

## Key Files

- `package.json` — CLI manifest declaring the workspace dependency on the core runtime and binary entry. Builds TypeScript sources to `dist/` before executing.
- `tsconfig.json` — package-level compiler configuration that emits ESM output into `dist/` while preserving `.js` extensions for runtime interoperability.
- `index.ts` — package entry that re-exports the core runtime and surfaces CLI-specific helpers.
- `bin/openagent.ts` — executable shim invoked by `npx openagent` or global installs; now type-checked instead of relying on `@ts-nocheck`.
- `src/runner.ts` — CLI bootstrap that validates environment configuration and launches the agent loop with guardrails around the core module exports.
- `src/` — Ink components, boot probes, runtime wiring, and readline helpers written in TypeScript. See [`src/context.md`](src/context.md).
- `src/loadCoreModule.ts` — resolves the core runtime dependency with a local fallback when the workspace link is missing, including runtime guards for missing exports.
- `src/render.ts`, `src/status.ts`, `src/thinking.ts`, `src/io.ts` — legacy console helpers and readline utilities that continue to underpin tests and non-Ink integrations, now fully typed.

## Related Context

- Core workspace providing the runtime: [`../core/context.md`](../core/context.md).
- CLI-specific documentation: [`../../docs/context.md`](../../docs/context.md).
