# Directory Context: src/agent

## Purpose & Scope
- Implements the agent runtime: conversation loop, OpenAI request orchestration, command execution, plan tracking, and approval flow.

## Key Modules
- `loop.js` — orchestrates the event-driven runtime: manages plan snapshots, queues inputs/outputs, handles OpenAI calls, applies filters, and coordinates cancellation.
- `approvalManager.js` — centralizes auto-approval checks (allowlist/session flags) and human prompts.
- `commandExecution.js` — dispatches agent commands to handlers (`commands/`), tracks runtime metadata, and captures outputs.
- `commands/` subdirectory — specialized handlers for `read` vs. generic execute operations.
- `historyCompactor.js`, `observationBuilder.js`, `responseParser.js`, `responseValidator.js`, `responseToolSchema.js` — manage conversation state, define the response envelope schema, parse Responses API payloads, and validate protocol compliance.
- `openaiRequest.js` — builds structured responses requests with retries and timeout handling.
- `promptCoordinator.js`, `escState.js` — route human prompts, handle ESC cancellations.
- `passExecutor.js` — handles multi-pass reasoning loops (execute/reflect cycles) when the model requests continuations.

## Positive Signals
- Extensive unit coverage ensures protocol parsing/validation logic stays aligned with prompts.
- Plan management persists state to `.openagent/plan.json` and supports optional plan merging.
- Approval flow separates policy (`services/commandApprovalService.js`) from human interaction logic.

## Risks / Gaps
- Runtime complexity is high; when modifying event shapes ensure CLI (`src/cli`) and WebSocket bindings stay in sync.
- History compaction relies on model token limits; verify assumptions when changing default model or context window.
- Error surfaces lean on console warnings; consider structured logging for external integrations.

## Related Context
- CLI consumer of runtime events: [`../cli/context.md`](../cli/context.md).
- Command execution primitives: [`../commands/context.md`](../commands/context.md).
- OpenAI client utilities: [`../openai/context.md`](../openai/context.md).
