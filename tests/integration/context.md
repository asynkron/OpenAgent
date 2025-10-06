# Directory Context: tests/integration

## Purpose

- Exercises the agent loop end-to-end with mocked OpenAI responses and CLI interactions.

## Key Tests

- `agentLoop.integration.test.js`: verifies the loop executes a mocked command, honours auto-approve, and closes readline.
- `agentRead.integration.test.js`: ensures read commands dispatch through `runRead` instead of shell execution.
- `approvalFlow.integration.test.js`: covers human approval prompts (approve once vs reject) before command execution.
- `commandEdit.integration.test.js`: uses real filesystem writes to confirm `applyFileEdits` behaviour.
- `cmdStats.integration.test.js`: validates command usage stats stored under XDG data dirs.
- `shortcuts.integration.test.js` / `templates.integration.test.js`: spawn CLI subcommands to ensure JSON assets are valid.

## Positive Signals

- Coverage spans primary user flows (command execution, read/edit helpers, CLI wrappers).

## Risks / Gaps

- Tests mock `process.exit` indirectly via `execFileSync`; failures could exit the runner if not caught.
- No integration coverage for cancellation paths (ESC); string quoting built-ins now covered by dedicated tests.

## Related Context

- Unit complement: [`../unit/context.md`](../unit/context.md)
- Runtime under test: [`../../src/agent/context.md`](../../src/agent/context.md)
