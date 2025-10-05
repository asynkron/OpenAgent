# Directory Context: tests

## Purpose
- Jest suites covering unit and integration behaviour for OpenAgent.
- Includes helper mocks (e.g., OpenAI stub) to isolate external dependencies.

## Structure
- `integration/`: high-level tests exercising the agent loop, command runners, and CLI wrappers.
- `unit/`: focused tests for utilities, command helpers, rendering logic, etc.
- `mockOpenAI.js`: global mocking hook for the `openai` package during integration runs.

## Positive Signals
- Integration tests validate agent loop approvals, read command dispatch, command stats persistence, and CLI wrappers for templates/shortcuts.
- Unit tests cover editing utilities, cancellation manager, renderer language heuristics, and runCommand lifecycle.

## Risks / Gaps
- No coverage for new `escapeString`/`unescapeString` built-ins or browse helper edge cases.
- Integration tests rely on direct `process.exit`; failures could terminate the test runner abruptly if mocks fail.

## Related Context
- Runtime modules under test: [`../src/context.md`](../src/context.md)
- Subsuite details:
  - [`integration/context.md`](integration/context.md)
  - [`unit/context.md`](unit/context.md)
