# Directory Context: src/agent

## Purpose

- Houses the conversational control loop that coordinates OpenAI calls, human approvals, and command execution.

## Key Modules

- `loop.js`: exposes the event-driven runtime (`createAgentRuntime`) that emits structured JSON events and wraps it with the legacy `createAgentLoop` helper for compatibility.
- `promptCoordinator.js`: provides the `PromptCoordinator` class that mediates prompt requests/responses between the runtime and UI surfaces.
- `escState.js`: centralises cancellation state, allowing UI-triggered events to notify in-flight operations.
- `passExecutor.js`: performs an agent pass (OpenAI request, JSON parsing, plan updates, approvals, command execution, observation logging).
- `historyCompactor.js`: auto-compacts older history entries when context usage exceeds the configured threshold by summarizing them into long-term memory snapshots.
- `commandExecution.js`: routes assistant commands to the correct runner (edit/read/browse/escape/etc.) through dedicated handler classes so built-ins are interpreted before falling back to shell execution.
- `commands/`: concrete command handler classes implementing the shared `ICommand` contract used by `commandExecution.js`.
- `openaiRequest.js`: wraps the OpenAI SDK call, wiring ESC cancellation, request aborts, and observation recording into a single surface.
- `observationBuilder.js`: normalises command results into CLI previews and LLM observations so the conversation history remains consistent.

## Architecture Overview

- The runtime created by `loop.js` pushes every CLI-facing side effect through structured events. Consumers provide dependency bags (command runners, approval hooks, CLI renderers) so tests can replace them in isolation.
- On `start()`, the runtime emits startup status messages, captures human prompts through the `PromptCoordinator`, then dispatches them to `executeAgentPass()`.
- `executeAgentPass()` now coordinates three specialised helpers:
  1. `openaiRequest.js` issues the model call and handles cancellation/ESC plumbing.
  2. `approvalManager.js` determines whether a proposed command can run automatically or needs a human decision.
  3. `commandExecution.js` executes built-ins before shell commands and returns structured execution metadata.
- After every pass, `observationBuilder.js` converts command output into both CLI previews and history observations so the next model call has the right context.
- `loop.js` maintains an active plan manager that merges partial LLM plan updates, emits the merged outline to UIs, and writes a snapshot to `.openagent/todo.md` at repo root so humans can inspect the current plan.
- Integration suites mock `openaiRequest.js` to enqueue deterministic completions, reflecting the module boundaries introduced by this architecture.

## Positive Signals

- Cancellation, approval, and execution logic are modular, improving test coverage.
- Rich logging/render hooks injected via dependency bag for easier testing/mocking.
- Maintains conversation history explicitly, facilitating reproducibility.
- OpenAI invocations now lean on the shared helper in `openai/responses.js`, keeping reasoning configuration consistent.
- History compaction prints the generated summary to the CLI so humans can keep track of the active intent.

## Related Context

- CLI rendering invoked from here: [`../cli/context.md`](../cli/context.md)
- Command runners used for execution: [`../commands/context.md`](../commands/context.md)
- Approval rules source: [`../commands/context.md`](../commands/context.md)
- Tests exercising the loop: [`../../tests/integration/context.md`](../../tests/integration/context.md)
