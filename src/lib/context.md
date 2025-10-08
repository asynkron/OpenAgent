# Directory Context: src/lib

## Purpose & Scope
- Package-facing entry points that re-export the agent runtime, CLI helpers, and startup flag plumbing for external consumers.

## Key Files
- `index.js` — imports core modules (agent loop, CLI renderers, OpenAI client) and re-exports them as named exports plus a default aggregate object. Loads environment variables via `dotenv/config`.
- `startupFlags.js` — parses CLI flags, tracks toggles (auto-approve, plan merging, debug), and exposes setters/getters shared between CLI and programmatic consumers.

## Positive Signals
- Central export file documents responsibilities, making it easy for library consumers to pick specific APIs.
- Startup flags have unit tests ensuring parsing and state transitions behave deterministically.

## Risks / Gaps
- Import side effects (loading `.env`) occur on module load; ensure this is acceptable when bundling or embedding.
- Changes to export names must remain semver-safe; coordinate with `package.json` main/module fields.

## Related Context
- CLI usage of startup flags: [`../cli/context.md`](../cli/context.md).
- Runtime internals being re-exported: [`../agent/context.md`](../agent/context.md), [`../commands/context.md`](../commands/context.md).
