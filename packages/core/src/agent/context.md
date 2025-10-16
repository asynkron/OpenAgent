# Directory Context: src/agent

## Purpose & Scope

- Implements the agent runtime: conversation loop, OpenAI request orchestration, command execution, plan tracking, and approval flow.

## Key Modules

- `loop.ts` (emits `loop.js`) — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, coordinates cancellation, and enforces a payload-growth failsafe that dumps runaway histories before retrying. The runtime exposes factory hooks (`createOutputsQueueFn`, `createInputsQueueFn`, `createPlanManagerFn`, `createEscStateFn`, `createPromptCoordinatorFn`, `createApprovalManagerFn`) so hosts can inject alternatives without patching the core loop. Additional DI knobs let callers override logging, request cancellation, prompt phrasing, auto-response limits, and downstream pass executor dependencies.
- `runtimeTypes.ts`, `runtimeEmitter.ts`, `runtimeFactories.ts`, and `runtimePayloadGuard.ts` collectively pull loop orchestration helpers (shared types, event emission, DI factory wiring, and request-payload safeguards) out of `loop.ts` so the main runtime file stays focused on control flow. The payload guard now records the size of each transmitted request and lets the executor re-baseline after responses so assistant-inflated histories don't trigger the growth failsafe unnecessarily.
- `runtimeSharedConstants.ts` hosts the loop-wide constants (auto-response copy, plan reminder text, payload growth factor) shared by the new helper modules and `loop.ts`.
- `runtimeCollaborators.ts` centralizes plan manager, prompt coordinator, and approval manager wiring so `loop.ts` can import a pre-bundled set of collaborators.
- `runtimeMemory.ts` builds the memory policy controller that applies amnesia/dementia filters outside the main control loop.
- `passExecutor.ts` (emits `passExecutor.js`) — coordinates multi-pass reasoning. It requests model completions, parses and validates assistant responses, merges incoming plan data, dispatches shell commands, records observations, nudges the model when plans stall, and syncs plan snapshots back to disk. The helper accepts overridable collaborators for OpenAI calls, command execution, history compaction, observation building, context usage summaries, and schema validation. Supporting utilities live alongside it under `passExecutor/` (plan execution helpers, refusal heuristics) so orchestration logic stays focused on control flow, and a lightweight plan-reminder controller remains for compatibility with older hosts. Recent tightening removed `@ts-nocheck`, aligning the module with typed OpenAI clients and DI hooks so build-time checking now covers its glue code. The orchestration now fans out to dedicated helpers: `passExecutor/assistantResponse.ts` validates model output, `passExecutor/planRuntime.ts` owns plan state (automatically pruning completed steps, unblocking dependants, and emitting compact history snapshots that retain only step ids, statuses, and command outcomes), `passExecutor/commandRuntime.ts` runs approved commands, and `passExecutor/debugEmitter.ts` standardises debug payload emission.
- `passExecutor.ts` now composes dedicated helpers: `passExecutor/executionContext.ts` materializes dependencies, `passExecutor/prePassSequence.ts` runs the payload guard/history compaction/context summary chain, `passExecutor/responseResolution.ts` normalizes assistant responses, and `passExecutor/planExecutor.ts` owns plan iteration and command execution (emitting a dedicated `command-rejected` outcome when a human veto stops a command so the next pass can recover).
- `passExecutor/planReminderController.ts` centralizes the auto-response tracker shim so `passExecutor.ts` interacts with a consistent controller even when hosts omit custom reminder logic.
- `passExecutor/planManagerAdapter.ts` wraps the optional plan manager behind a typed adapter, giving the executor a predictable API for plan merging, resets, and persistence even when hosts only partially implement the contract.
- `approvalManager.ts` (emits `approvalManager.js`) — normalizes the approval policy: checks allowlists/session approvals, optionally prompts the human, and records session grants.
- `amnesiaManager.ts` (emits `amnesiaManager.js`) — prunes stale history entries and exposes a dementia policy helper that drops messages older than the configured pass threshold.
- `commandExecution.ts` (emits `commandExecution.js`) and `commands/ExecuteCommand.ts` — normalize assistant command payloads and delegate to the injected shell runner.
- `escState.ts` (emits `escState.js`) — tracks ESC-triggered cancellations and lets consumers await the next cancellation event.
- `observationBuilder.ts` (emits `observationBuilder.js`) — formats command results into preview payloads and observation envelopes while guarding against oversized outputs. It now enforces a 200-line default cap (with optional `command.tail_lines` overrides), honours the required `command.max_bytes` limit (default 16 KiB per command), and annotates truncated output with explicit notices for the model. Both defaults are sourced from `../constants.ts` so schemas and runtime stay aligned.
- `modelRequest.ts` (emits `modelRequest.js`) — wraps the AI SDK responses client with ESC cancellation support and emits cancellation observations when humans abort requests.
- `historyEntry.ts`, `historyCompactor.ts`, and `runtimePayloadGuard.ts` normalize chat history into the AI SDK message shape so downstream helpers stay provider-agnostic. `historyEntry.ts` now stores `role`/`content` exclusively inside the nested `payload` (with non-enumerable accessors for callers), eliminating the duplicated fields that previously bloated history snapshots.
- `modelRequestPayload.ts` — builds the strongly typed request envelope (model, messages, tool definition) consumed by `modelRequest.ts` so tests and runtime code can reason about AI calls without ad-hoc casting.
- `planManager.ts` (emits `planManager.js`) — manages plan snapshots in-memory only, merges assistant updates, and emits plan progress events. All filesystem persistence has been removed.
- `promptCoordinator.ts` (emits `promptCoordinator.js`) — buffers prompt responses from the UI and relays cancellation signals through the shared ESC state.
- `responseParser.ts`, `responseValidator.ts`, and `responseToolSchema.ts` (emit their `.js` companions) — parse assistant JSON, normalize plan/command payloads, and enforce schema plus semantic validations for the OpenAgent tool response. The AI SDK `generateObject()` is configured with a provider-agnostic JSON Schema wrapper (`jsonSchema(() => RESPONSE_PARAMETERS_SCHEMA)`), while runtime validation uses the same JSON Schema via AJV. The `responseValidator.ts` surface now re-exports helpers from `responseValidation/`, where AJV wiring, schema error formatting, and plan semantics live in smaller typed modules. The Zod schema remains for developer ergonomics but is not used at runtime. In addition, `responseToolSchema.ts` exports inferred types `OpenAgentCommand`, `OpenAgentPlanStep`, and `OpenAgentResponse` for consumers that prefer strong DTOs.
- `historyEntry.ts`, `historyMessageBuilder.ts`, and `historyCompactor.ts` — previously migrated helpers that the runtime still imports via their compiled `.js` outputs. The history entry helper now proxies `role`/`content` through the payload to keep serialized history lean.

## Positive Signals

- Extensive unit coverage ensures protocol parsing/validation logic stays aligned with prompts.
- Plan management is transient; no on-disk persistence. Optional plan merging remains, while execution-time status changes stay in memory until the next assistant response.
- Approval flow separates policy (`services/commandApprovalService.js`) from human interaction logic.
- Tests now rely on dependency injection to stub the OpenAI client, so local runs do not require a real API key.
- Lint now runs clean across the runtime: observation building, OpenAI request orchestration, the pass executor, plan manager, and response validator share explicit types and error guards instead of `any` fallbacks.
- The OpenAI request wrapper now leans on the AI SDK response types so cancellation paths and completion payloads are validated at compile time.

## Risks / Gaps

- Runtime complexity is high; when modifying event shapes ensure CLI (`packages/cli/src`) and WebSocket bindings stay in sync.
- History compaction relies on model token limits; verify assumptions when changing default model or context window.
- Error surfaces lean on console warnings; consider structured logging for external integrations.

## Related Context

- CLI consumer of runtime events: [`../cli/context.md`](../cli/context.md).
- Command execution primitives: [`../commands/context.md`](../commands/context.md).
- OpenAI client utilities: [`../openai/context.md`](../openai/context.md).

## Maintenance Notes (2025-10-13)

- Pass executor helpers were split into `executionContext`, `prePassSequence`, `responseResolution`, and `planExecutor` modules to keep the orchestration under 50 lines while retaining targeted unit tests for each path.
- Updated `passExecutor/planReminderController.ts` to call tracker methods on the tracker object (no destructuring) so `this` remains bound for stateful implementations. This resolves a failing test where a custom tracker used `this.count` internally.
- Factory initialization for the plan manager, prompt coordinator, and approval manager now flows through a shared helper that reports invalid factories before falling back to the default implementations.
- `loop.ts` now ships with strict TypeScript types (queues, factories, event observers) so downstream consumers receive typed runtime APIs without relying on `@ts-nocheck` escapes. The companion `loop.test.ts` was updated to use typed stub queues and prompt coordinators.
- `passExecutor.ts` now consolidates approval, execution safety, and plan snapshot helpers so the main loop reads linearly while emitting consistent status updates.
- Pass executor unit tests now import shared helpers from `__testUtils__/passExecutor.ts` (moved out of `__tests__` so Jest does not collect it as a suite), keeping the primary spec focused on behavior assertions instead of repeated mock wiring.
- `passExecutor/commandRuntime.ts` emits the active plan step snapshot alongside each `command-result` event so downstream UIs can display the parent step metadata with command output.
- `passExecutor.ts` explicitly treats human command rejections as a successful pass result, and the pass executor suite now includes a regression test to ensure the loop continues after vetoes.
- Plan runtime now keeps completed steps in the active plan until the next assistant response (so the model can read the results), updates dependent `waitingForId` arrays, and no longer emits plan reminder auto-responses; downstream hosts should rely on the automatic executor instead of prompt nudges.
- Plan runtime now also tracks identifiers for steps that have been pruned so duplicate entries from later assistant responses are ignored while the rest of the plan continues executing.
- When the assistant sends an explicit empty plan (`[]`), the runtime clears the completed-step registry so identifiers can be reused after a full reset.
