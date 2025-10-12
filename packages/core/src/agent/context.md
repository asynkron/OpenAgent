# Directory Context: src/agent

## Purpose & Scope

- Implements the agent runtime: conversation loop, OpenAI request orchestration, command execution, plan tracking, and approval flow.

## Key Modules

- `loop.js` — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, coordinates cancellation, and now JSON-clones every emitted event so subscribers observe immutable snapshots. The runtime exposes factory hooks (`createOutputsQueueFn`, `createInputsQueueFn`, `createPlanManagerFn`, `createEscStateFn`, `createPromptCoordinatorFn`, `createApprovalManagerFn`) so hosts can inject alternative implementations without patching the core loop, emits a `pass` event whenever a new reasoning pass begins so UIs can surface the active counter, and now enforces a payload-growth failsafe that terminates the process if the estimated OpenAI request swells by roughly fivefold between passes.
- `loop.js` — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, coordinates cancellation, and now JSON-clones every emitted event so subscribers observe immutable snapshots. The runtime exposes factory hooks (`createOutputsQueueFn`, `createInputsQueueFn`, `createPlanManagerFn`, `createEscStateFn`, `createPromptCoordinatorFn`, `createApprovalManagerFn`) so hosts can inject alternative implementations without patching the core loop, emits a `pass` event whenever a new reasoning pass begins so UIs can surface the active counter, and now enforces a payload-growth failsafe that terminates the process if the estimated OpenAI request swells by roughly fivefold between passes.
- `loop.js` — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, coordinates cancellation, and now JSON-clones every emitted event so subscribers observe immutable snapshots. The runtime exposes factory hooks (`createOutputsQueueFn`, `createInputsQueueFn`, `createPlanManagerFn`, `createEscStateFn`, `createPromptCoordinatorFn`, `createApprovalManagerFn`) so hosts can inject alternative implementations without patching the core loop, emits a `pass` event whenever a new reasoning pass begins so UIs can surface the active counter, and now enforces a payload-growth failsafe that terminates the process if the estimated OpenAI request swells by roughly fivefold between passes.

   Additional DI hooks available in `createAgentRuntime`:
   - `logger` — console-like sink used by default `createHistoryCompactorFn`.
   - `idGeneratorFn` — generate deterministic `__id`s for emitted events (useful for tests).
   - `transformEmittedEventFn(event)` — transform or drop events before they reach the outputs queue.
   - `applyDementiaPolicyFn` — override the default dementia pruning behavior.
   - `createChatMessageEntryFn` — customize chat message envelope creation.
   - `executeAgentPassFn` — replace the default pass executor implementation.
   - `createPlanAutoResponseTrackerFn` — supply a custom plan reminder counter implementation.
 - `loop.js` — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, coordinates cancellation, and now JSON-clones every emitted event so subscribers observe immutable snapshots. The runtime exposes factory hooks (`createOutputsQueueFn`, `createInputsQueueFn`, `createPlanManagerFn`, `createEscStateFn`, `createPromptCoordinatorFn`, `createApprovalManagerFn`) so hosts can inject alternative implementations without patching the core loop, emits a `pass` event whenever a new reasoning pass begins so UIs can surface the active counter, and now enforces a payload-growth failsafe that terminates the process if the estimated OpenAI request swells by roughly fivefold between passes.

   New DI hooks in `createAgentRuntime`:
   - `logger` — console-like sink used by default `createHistoryCompactorFn`.
   - `idGeneratorFn` — generate deterministic `__id`s for emitted events (useful in tests).
   - `transformEmittedEventFn(event)` — transform or drop events before they reach the outputs queue.
   - `applyDementiaPolicyFn` — override default dementia pruning behavior.
   - `createChatMessageEntryFn` — customize chat message envelope creation.
   - `executeAgentPassFn` — replace the default pass executor implementation.
   - `createPlanAutoResponseTrackerFn` — supply a custom plan reminder counter implementation.
   - `cloneEventPayloadFn` — override event deep-clone behavior used by the emitter.
   - `cancelFn` — provide a custom cancellation function passed to the prompt coordinator.
   - `planReminderMessage` — customize the reminder text when the plan is pending.
   - `userInputPrompt` — customize the prompt label shown for user input.
   - `noHumanAutoMessage` — customize the auto-message used in no-human mode.
   - `idPrefix` — customize the prefix used for emitted event `__id`s.
   - `transformEmittedEventFns[]` — optional chain of event transformers applied after `transformEmittedEventFn`.
   - `eventObservers[]` — optional observers invoked after an event has been enqueued.
   - `passExecutorDeps` — object bag forwarded to `executeAgentPass` so hosts can override deeper dependencies (e.g., `requestModelCompletionFn`, `executeAgentCommandFn`, `createObservationBuilderFn`, `parseAssistantResponseFn`, `validateAssistantResponseFn`, `validateAssistantResponseSchemaFn`, `createChatMessageEntryFn`, `extractOpenAgentToolCallFn`, `summarizeContextUsageFn`, `incrementCommandCountFn`, `combineStdStreamsFn`, `buildPreviewFn`).

 - `passExecutor.js` — now supports additional DI hooks without changing defaults:
   - `requestModelCompletionFn`, `executeAgentCommandFn`, `createObservationBuilderFn`.
   - `parseAssistantResponseFn`, `validateAssistantResponseFn`, `validateAssistantResponseSchemaFn`.
   - `createChatMessageEntryFn`, `extractOpenAgentToolCallFn`.
   - `summarizeContextUsageFn`, `incrementCommandCountFn`.
   - `combineStdStreamsFn`, `buildPreviewFn`.
   Provide any subset via `passExecutorDeps` on `createAgentRuntime`.

 - `approvalManager.js` — constructor accepts optional `buildPromptFn(command, cfg)` and `parseDecisionFn(raw)` to customize the human approval UX while keeping the default CLI prompt.

 - `planManager.js` — accepts `serializePlanFn(plan)` and `deserializePlanFn(raw)` to customize persistence format (defaults to pretty JSON).
- `approvalManager.js` — centralizes auto-approval checks (allowlist/session flags) and human prompts; the constructor normalizes optional collaborators once so runtime logic can invoke them without repetitive type guards.
- `commandExecution.js` — normalizes assistant commands before dispatching to the default executor and tracks runtime metadata.
- `commands/` subdirectory — houses the default execute strategy used for all shell invocations.
- `historyCompactor.js`, `observationBuilder.js`, `historyMessageBuilder.js`, `historyEntry.js`, `responseParser.js`, `responseValidator.js`, `responseToolSchema.js` — manage conversation state, define the response envelope schema (including the named OpenAI tool contract with inline command validation), normalize nested plan step commands and observations, format observation/auto-response history entries, centralize chat entry envelopes (including the OpenAI-safe payload), parse Responses API payloads, normalize assistant command payloads (including newline sanitization and mapping `cmd`/`command_line` aliases back to `run`), enforce JSON schema compliance, and validate protocol guardrails. History messages now carry explicit `type` discriminators with JSON-serialized bodies and a numeric `pass` index so every payload sent to the model is machine-readable and associated with the reasoning turn that produced it. The schema continues to require stable `id` labels on plan steps plus full shell/run command objects, and the corresponding unit/integration suites exercise those constraints while permitting more than three top-level steps when the assistant proposes a larger plan.
- `amnesiaManager.js` — applies pass-aware "amnesia" filters that redact or drop bulky JSON payloads once they age beyond ten passes and exposes a shared dementia policy helper that prunes entries older than the configured hard limit.
- `openaiRequest.js` — builds structured responses requests with retries and timeout handling.
- `promptCoordinator.js`, `escState.js` — route human prompts, handle ESC cancellations, and guard against idle ESC presses latching cancellations.
- `passExecutor.js` — orchestrates multi-pass reasoning loops (execute/reflect cycles) when the model requests continuations, skips blank run/shell payloads so empty commands fall back to the message-only path, funnels plan manager calls through a single helper to keep optional method checks centralized, caps plan reminder auto-responses to three consecutive attempts so humans can step in before the loop stalls, executes commands directly from active plan steps while embedding their observations back into the plan before returning control to the model, marks any plan step that runs a command as `running`, matches executable steps by stable keys so later status updates persist even after re-collecting runnable work, re-evaluates runnable steps after each command so multiple ready actions can run during a single pass while honoring plan priority ordering, re-emits persisted plan updates after execution so UIs see status changes, clears fully completed plans before the next user prompt, and now wraps multi-command execution inside a single thinking event span so front-ends keep the spinner active until the final command finishes.
- `planManager.js` — persists normalized plans to `.openagent/plan.json`, merges assistant updates into the active plan when plan-merge mode is enabled, now exposes a `sync` helper so runtime mutations (e.g., status or observation updates) flush back to disk, and retains the previous plan when the assistant omits the plan payload.

## Positive Signals

- Extensive unit coverage ensures protocol parsing/validation logic stays aligned with prompts.
- Plan management persists state to `.openagent/plan.json` and supports optional plan merging.
- Approval flow separates policy (`services/commandApprovalService.js`) from human interaction logic.

## Risks / Gaps

- Runtime complexity is high; when modifying event shapes ensure CLI (`packages/cli/src`) and WebSocket bindings stay in sync.
- History compaction relies on model token limits; verify assumptions when changing default model or context window.
- Error surfaces lean on console warnings; consider structured logging for external integrations.

## Related Context

- CLI consumer of runtime events: [`../cli/context.md`](../cli/context.md).
- Command execution primitives: [`../commands/context.md`](../commands/context.md).
- OpenAI client utilities: [`../openai/context.md`](../openai/context.md).
