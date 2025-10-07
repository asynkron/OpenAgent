# Directory Context: tests/integration

## Purpose

- Exercises the agent loop end-to-end with mocked OpenAI responses and CLI interactions.

## Key Tests

- `agentLoop.integration.test.js`: verifies the loop executes a mocked command, honours auto-approve, closes readline, now asserts that enabling the startup debug flag produces debug envelopes on the runtime stream, and checks protocol validation errors only surface on the debug channel.
- `agentRead.integration.test.js`: ensures read commands dispatch through `runRead` instead of shell execution.
- `approvalFlow.integration.test.js`: covers human approval prompts (approve once vs reject) and auto-approval of preapproved commands before execution; harness now seeds plan statuses so the loop exercises the multi-pass flow introduced with the refreshed plan renderer.
- `commandEdit.integration.test.js`: uses real filesystem writes to confirm `applyFileEdits` behaviour.
- `cmdStats.integration.test.js`: validates command usage stats stored under XDG data dirs.
- `agentCancellation.integration.test.js`: drives an ESC-triggered cancel to verify UI requests unwind command execution.
- Shared helpers live in `agentRuntimeTestHarness.js`, which mocks model completions and command-stat tracking so suites can focus on runtime behaviour without touching the filesystem or OpenAI SDK.
- `testRunnerUI.js` provides a lightweight reactive UI harness that consumes runtime events and feeds queued responses by scope (user input vs approval prompts), reducing per-suite boilerplate.

## Positive Signals

- Coverage spans primary user flows (command execution, read/edit helpers, CLI wrappers).

## Risks / Gaps

- Tests mock `process.exit` indirectly via `execFileSync`; failures could exit the runner if not caught.
- Cancellation suite uses mocked commands; exercising a real child process under ESC would strengthen confidence.

## Related Context

- Unit complement: [`../unit/context.md`](../unit/context.md)
- Runtime under test: [`../../src/agent/context.md`](../../src/agent/context.md)
