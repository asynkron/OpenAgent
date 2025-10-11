# Directory Context: src/agent

## Purpose & Scope

- Implements the agent runtime: conversation loop, OpenAI request orchestration, command execution, plan tracking, and approval flow.

## Key Modules

- `loop.js` — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, and coordinates cancellation.
- `approvalManager.js` — centralizes auto-approval checks (allowlist/session flags) and human prompts; the constructor normalizes optional collaborators once so runtime logic can invoke them without repetitive type guards.
- `commandExecution.js` — normalizes assistant commands before dispatching to the default executor and tracks runtime metadata.
- `commands/` subdirectory — houses the default execute strategy used for all shell invocations.
- `historyCompactor.js`, `observationBuilder.js`, `historyMessageBuilder.js`, `historyEntry.js`, `responseParser.js`, `responseValidator.js`, `responseToolSchema.js` — manage conversation state, define the response envelope schema (including the named OpenAI tool contract with inline command validation), normalize nested plan step commands and observations, format observation/auto-response history entries, centralize chat entry envelopes (including the OpenAI-safe payload), parse Responses API payloads, normalize assistant command payloads (including newline sanitization and mapping `cmd`/`command_line` aliases back to `run`), enforce JSON schema compliance, and validate protocol guardrails. History messages now carry explicit `type` discriminators with JSON-serialized bodies and a numeric `pass` index so every payload sent to the model is machine-readable and associated with the reasoning turn that produced it.
- `amnesiaManager.js` — applies pass-aware "amnesia" filters that redact or drop bulky JSON payloads once they age beyond ten passes and exposes a shared dementia policy helper that prunes entries older than the configured hard limit.
- `openaiRequest.js` — builds structured responses requests with retries and timeout handling.
- `promptCoordinator.js`, `escState.js` — route human prompts, handle ESC cancellations, and guard against idle ESC presses latching cancellations.
- `passExecutor.js` — orchestrates multi-pass reasoning loops (execute/reflect cycles) when the model requests continuations, skips blank run/shell payloads so empty commands fall back to the message-only path, funnels plan manager calls through a single helper to keep optional method checks centralized, caps plan reminder auto-responses to three consecutive attempts so humans can step in before the loop stalls, and now executes commands directly from active plan steps while embedding their observations back into the plan before returning control to the model.

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
