# Directory Context: packages/core/src

## Purpose & Scope

- Source code for the headless OpenAgent runtime exported by `@asynkron/openagent-core`.
- Hosts orchestration logic, command execution, OpenAI client adapters, and shared utilities used by every front-end.

## Key Subdirectories

- `agent/` — orchestration loop, command execution strategies, approval flow, and plan management. See [`agent/context.md`](agent/context.md).
- `bindings/` — adapters for alternative front-ends (currently the WebSocket binding).
- `commands/` — shell command executors and helpers.
- `services/` — command approval allowlist/session tracking plus command statistics collection.
- `openai/` — client configuration, request/response helpers, response extraction utilities.
- `config/` — system prompt discovery/building.
- `lib/` — curated export surface (startup flags, runtime factory) consumed by package entry.
- `utils/` — shared helpers (async queues, cancellation, text formatting, plan math, JSON validation, HTTP fetch wrapper).

## Positive Signals

- Modular design cleanly separates pure helpers from side-effectful layers; facilitates testing and alternate UIs.
- Startup flags (`lib/startupFlags.js`) centralize configuration toggles and are covered by unit tests.

## Risks / Gaps

- Agent loop is complex with many dependencies; ensure integration tests remain up-to-date when changing event contracts.
- Some utilities (e.g., `utils/fetch.js`) wrap `undici`; monitor upstream API changes to avoid deprecations.

## Related Context

- Package entry docs: [`../context.md`](../context.md), [`lib/context.md`](lib/context.md).
- Tests exercising these modules: [`../../tests/context.md`](../../tests/context.md).
- CLI consumer of the runtime: [`../../cli/context.md`](../../cli/context.md).
