# Directory Context: packages/core/src

## Purpose & Scope

- Source code for the headless OpenAgent runtime exported by `@asynkron/openagent-core`.
- Hosts orchestration logic, command execution, OpenAI client adapters, and shared utilities used by every front-end.

## Key Subdirectories

- `agent/` — orchestration loop, command execution strategies, approval flow, and plan management. See [`agent/context.md`](agent/context.md).
- `bindings/` — adapters for alternative front-ends (currently the WebSocket binding).
- `contracts/` — canonical DTO module exporting tool DTOs, model request/response types, completion wrapper types, and observation/history shapes for single-path imports. The OpenAgent tool schema now defaults `command.tail_lines` to 200 lines, requires `command.max_bytes` with a 16 KiB default cap (roughly 200 lines), and propagates those limits through the runtime JSON schema.
- `constants.ts` — shared runtime defaults (command byte/line caps, etc.) consumed by schemas, parsers, and tests to keep limit tuning in one place.
- `commands/` — shell command executors and helpers.
- `services/` — command approval allowlist/session tracking plus command statistics collection.
- `openai/` — client configuration, request/response helpers, response extraction utilities.
  - Includes `contracts.ts` barrel that re-exports request/response DTOs and the OpenAgent tool schema for single-path imports.
  - Canonical DTOs live under `contracts/index.ts` with consistent names (ModelRequest/ModelResponse, OpenAgentToolResponse, etc.). Prefer importing from `src/contracts`.
- `config/` — system prompt discovery/building.
- `lib/` — curated export surface (startup flags, runtime factory) consumed by package entry.
- `utils/` — shared helpers (async queues, cancellation, text formatting, plan math, JSON validation, HTTP fetch wrapper).
- The entire tree now ships `.ts` sources that compile into `dist/src/**` before publishing.

## Positive Signals

- Modular design cleanly separates pure helpers from side-effectful layers; facilitates testing and alternate UIs.
- Co-located `__tests__/` directories under `agent/`, `utils/`, `commands/`, `openai/`, `bindings/`, and `lib/` keep runtime unit
  coverage next to the implementation files.
- Startup flags (`lib/startupFlags.ts`) centralize configuration toggles and are covered by unit tests.

## Risks / Gaps

- Agent loop is complex with many dependencies; ensure integration tests remain up-to-date when changing event contracts.
- Some utilities (e.g., `utils/fetch.js`) wrap `undici`; monitor upstream API changes to avoid deprecations.

## Related Context

- Package entry docs: [`../context.md`](../context.md), [`lib/context.md`](lib/context.md).
- Single-responsibility architecture plan: [`../../docs/architecture/single-resp.md`](../../docs/architecture/single-resp.md).
- Tests exercising these modules: [`../../tests/context.md`](../../tests/context.md).
- CLI consumer of the runtime: [`../../cli/context.md`](../../cli/context.md).
