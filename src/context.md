# Directory Context: src

## Purpose & Scope

- Source code for the OpenAgent runtime, CLI, and integration surfaces exported to consumers.

## Key Subdirectories

- `agent/` — core orchestration loop, command execution strategies, approval flow, and plan management. See [`agent/context.md`](agent/context.md).
- `cli/` — Ink-based terminal UI components, runtime wiring, and boot probes. See [`cli/context.md`](cli/context.md).
- `commands/` — shell/read command executors and helpers.
- `services/` — command approval allowlist/session tracking, command statistics.
- `openai/` — client configuration, request/response helpers, response extraction utilities.
- `bindings/` — adapters for alternative front-ends (currently WebSocket binding).
- `config/` — system prompt discovery/building.
- `lib/` — package entry point that re-exports runtime APIs and startup flag plumbing.
- `utils/` — shared helpers (async queues, cancellation, text formatting, plan math, JSON validation, HTTP fetch wrapper).

## Positive Signals

- Modular design cleanly separates pure helpers from side-effectful layers; facilitates testing and alternate UIs.
- Startup flags (`lib/startupFlags.js`) centralize CLI configuration toggles and are covered by unit tests.

## Risks / Gaps

- Agent loop is complex with many dependencies; ensure integration tests remain up-to-date when changing event contracts.
- Some utilities (e.g., `utils/fetch.js`) wrap `undici`; monitor upstream API changes to avoid deprecations.

## Related Context

- Package entry docs: [`../index.js`](../index.js), [`lib/context.md`](lib/context.md).
- Tests exercising these modules: [`../tests/context.md`](../tests/context.md).
