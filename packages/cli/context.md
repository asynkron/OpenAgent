# Directory Context: packages/cli

## Purpose & Scope

- Workspace package that delivers the interactive CLI experience and publishes the `@asynkron/openagent` npm entry.
- Depends on `@asynkron/openagent-core` for the agent runtime and exposes Ink components plus the `openagent` binary.

## Key Files

- `package.json` — CLI manifest declaring the workspace dependency on the core runtime and binary entry. Builds TypeScript sources to `dist/` before executing.
- `tsconfig.json` — package-level compiler configuration that emits ESM output into `dist/`, preserves `.js` extensions for runtime interoperability, and enables the React JSX transform for TSX components.
- `index.ts` — package entry that re-exports the core runtime and surfaces CLI-specific helpers.
- `bin/openagent.ts` — executable shim invoked by `npx openagent` or global installs; now type-checked instead of relying on `@ts-nocheck`.
- `src/runner.ts` — CLI bootstrap that validates environment configuration and launches the agent loop with guardrails around the core module exports.
- `src/` — Ink components, boot probes, runtime wiring, and readline helpers written in TypeScript. See [`src/context.md`](src/context.md).
- `src/runtime.ts` — orchestrates dependency injection for the agent loop, memoizes Ink rendering, and tracks command usage stats for analytics. The runtime now consumes strongly typed core bindings to normalize dependencies before booting the Ink app.
- `src/loadCoreModule.ts` — resolves the core runtime dependency with a local fallback when the workspace link is missing, including runtime guards for missing exports and the shape assertions that back the shared type definitions in `types/openagent-core.d.ts`.
- `src/render.ts`, `src/status.ts`, `src/thinking.ts`, `src/io.ts` — legacy console helpers and readline utilities that continue to underpin tests and non-Ink integrations, now fully typed.
- `src/bootProbes/` — environment detection suite now type-checked end-to-end (context helpers, registry, and individual probes).

## Related Context

- Core workspace providing the runtime: [`../core/context.md`](../core/context.md).
- CLI-specific documentation: [`../../docs/context.md`](../../docs/context.md).
