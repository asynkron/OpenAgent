# Directory Context: packages/core/src

## Purpose & Scope

- Source code for the headless OpenAgent runtime exported by `@asynkron/openagent-core`.
- Hosts orchestration logic, command execution, OpenAI client adapters, and shared utilities used by every front-end.

## Key Subdirectories

- `agent/` — orchestration loop, command execution strategies, approval flow, and plan management. See [`agent/context.md`](agent/context.md). `modelRequest.ts` now relays partial structured response snapshots via debug events so UIs can render in-progress payloads.
- `bindings/` — adapters for alternative front-ends (currently the WebSocket binding).
- `contracts/` — canonical runtime contracts (commands, plans, chat history) and the tool Zod schemas. The OpenAgent tool schema defaults `command.tail_lines` to 200 lines, requires `command.max_bytes` with a 16 KiB default cap (roughly 200 lines), and propagates those limits through the runtime JSON schema. JSON schema definitions satisfy the `JSONSchema7` contract so provider utilities accept the generated validators without type assertions.
- `constants.ts` — shared runtime defaults (command byte/line caps, etc.) consumed by schemas, parsers, and tests to keep limit tuning in one place.
- `commands/` — shell command executors and helpers.
- `services/` — command approval allowlist/session tracking plus command statistics collection.
- `openai/` — client configuration, request/response helpers, response extraction utilities. Prefer importing shared DTOs directly from `contracts/index.ts`; the legacy barrel in this directory has been removed so call sites lean on the canonical module.
  - `responses.ts` now calls the AI SDK `streamObject` helper and exposes optional callbacks for partial structured responses, enabling downstream consumers to stream debug previews while awaiting the final object.
- `prompts/` — typed manager/IO definitions (`manager.ts`, `types.ts`) backing future prompt discovery work. The manager now accepts structured metadata (`promptId`, `description`, `tags`, and `extra` key-value entries) instead of loose records.
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
- Utility layer (`utils/fetch.ts`) relies on the built-in Fetch/Abort APIs with Node `http`/`https` fallbacks; keep an eye on upstream Node changes to stay compatible.

- Runtime events are centralized under contracts/events.ts with RuntimeEventType enum. The agent emitter and helpers use this to avoid stringly typed drift.

## Related Context

- Package entry docs: [`../context.md`](../context.md), [`lib/context.md`](lib/context.md).
- Single-responsibility architecture plan: [`../../docs/architecture/single-resp.md`](../../docs/architecture/single-resp.md).
- Tests exercising these modules: [`../../tests/context.md`](../../tests/context.md).
- CLI consumer of the runtime: [`../../cli/context.md`](../../cli/context.md).

## Maintenance Notes

- WebSocket binding imports core runtime types and handles the async queue DONE sentinel when iterating `outputs`. Error events are emitted with the typed `payload` envelope.
- Assistant response schema error serialization now preserves `instancePath` and `params` so downstream listeners receive complete validation details.
- Fixed deep relative imports to `utils/plan.js` in plan runtime and command result processing, and corrected a misplaced type import in the plan persistence coordinator.
- Runtime emitter assigns event IDs immutably during cloning instead of mutating a readonly field.
- Agent runtime start is now idempotent: repeated calls to `start()` on the same runtime instance return immediately without throwing. This prevents accidental double-starts from hosts integrating Ink/React or wrapper scripts.
