# Directory Context: tests

## Purpose

- Jest suites covering unit and integration behaviour for OpenAgent.
- Includes helper mocks (e.g., OpenAI stub) to isolate external dependencies.

## Structure

- `integration/`: high-level tests exercising the agent loop, command runners, and CLI wrappers.
- `unit/`: focused tests for utilities, command helpers, rendering logic, etc.
- `mockOpenAI.js`: Jest setup module that pre-registers the default `openai` mock for every suite.

## Positive Signals

- Integration tests validate agent loop approvals, read command dispatch, command stats persistence, and CLI wrappers for templates/shortcuts.
- Unit tests cover editing utilities, cancellation manager, renderer language heuristics, and runCommand lifecycle.
- ESC cancellation scenarios now have both integration coverage and nested cancellation regressions guarding the shared stack.

## Risks / Gaps

- Browse helper edge cases (non-GET verbs, custom headers) remain lightly exercised; keep extending HttpClient fixtures.
- Integration tests rely on direct `process.exit`; failures could terminate the test runner abruptly if mocks fail.

## Related Context

- Runtime modules under test: [`../src/context.md`](../src/context.md)
- Subsuite details:
  - [`integration/context.md`](integration/context.md)
  - [`unit/context.md`](unit/context.md)
