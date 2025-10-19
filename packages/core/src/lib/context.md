# Directory Context: packages/core/src/lib

## Purpose & Scope

- Defines the package-facing entry points exported by `@asynkron/openagent-core`.
- Re-exports the agent runtime, OpenAI client helpers, startup flags, and shared utilities without any CLI dependencies.

## Key Files

- `index.ts` — imports runtime modules (agent loop, OpenAI client, services, utilities) and re-exports them as named exports plus a default aggregate object. Loads environment variables via `dotenv/config` and now surfaces the canonical plan status enum alongside the `isTerminalStatus` helper for downstream UIs.
- `startupFlags.ts` — parses CLI flags, tracks toggles (auto-approve, plan merging, debug), and exposes setters/getters shared between CLI and programmatic consumers.

## Positive Signals

- Central export file documents responsibilities, making it easy for library consumers to pick specific APIs.
- Startup flags have unit tests ensuring parsing and state transitions behave deterministically.
- Type-only re-exports now forward the canonical runtime event contracts and history entries, letting downstream packages consume `@asynkron/openagent-core` without mirroring type definitions locally.

## Risks / Gaps

- Import side effects (loading `.env`) occur on module load; ensure this is acceptable when bundling or embedding.
- Changes to export names must remain semver-safe; coordinate with `package.json` entry fields.
- The entrypoint now type-checks without `@ts-nocheck`, so regressions will surface during `npm run typecheck`.

## Related Context

- CLI package consuming these exports: [`../../cli/context.md`](../../cli/context.md).
- Runtime internals being re-exported: [`../agent/context.md`](../agent/context.md), [`../commands/context.md`](../commands/context.md).
