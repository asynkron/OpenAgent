# Directory Context: tests/integration

## Purpose

- Exercises the agent loop end-to-end with mocked OpenAI responses and CLI interactions.

## Key Tests

- `agentLoop.integration.test.js`: verifies the loop executes a mocked command, honours auto-approve, and closes readline.
- `agentRead.integration.test.js`: ensures read commands dispatch through `runRead` instead of shell execution.
- `approvalFlow.integration.test.js`: covers human approval prompts (approve once vs reject) before command execution and
  session/allowlist auto-approvals.
- `cancellation.integration.test.js`: exercises ESC-triggered cancellation paths for shell commands and nested
  cancellation stacks.
- `commandEdit.integration.test.js`: uses real filesystem writes to confirm `applyFileEdits` behaviour.
- `cmdStats.integration.test.js`: validates command usage stats stored under XDG data dirs.
- `shortcuts.integration.test.js` / `templates.integration.test.js`: spawn CLI subcommands to ensure JSON assets are valid.

## Positive Signals

- Coverage spans primary user flows (command execution, read/edit helpers, CLI wrappers).
- Recent refactors mock `requestModelCompletion` directly, aligning with the loop's dependency injection surface instead of monkey-patching the OpenAI SDK.

## Risks / Gaps

- Tests mock `process.exit` indirectly via `execFileSync`; failures could exit the runner if not caught.
- Cancellation scenarios now covered for shell commands; ESC propagation through OpenAI requests remains unit-tested.

## Related Context

- Unit complement: [`../unit/context.md`](../unit/context.md)
- Runtime under test: [`../../src/agent/context.md`](../../src/agent/context.md)
