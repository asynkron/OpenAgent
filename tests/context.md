# Directory Context: tests

## Purpose & Scope
- Jest-based test suites validating agent behavior end-to-end (`integration/`) and by component (`unit/`). Includes shared mocks.

## Key Areas
- `integration/` — orchestrates full agent runs using a mocked OpenAI backend. See [`integration/context.md`](integration/context.md).
- `unit/` — targeted tests for utilities, CLI rendering, OpenAI adapters, etc. See [`unit/context.md`](unit/context.md).
- `mockOpenAI.js` — fixture exposing deterministic OpenAI responses for integration harnesses.
- `ink-testing-library` dev dependency drives terminal keystroke simulation for CLI component specs.

## Positive Signals
- Integration harness (`agentRuntimeTestHarness.js`) simulates CLI runtime, ensuring plan updates, command execution, and cancellation all cooperate.
- Unit coverage spans plan utilities, prompt parsing, HTTP client, WebSocket binding, and CLI rendering—a broad regression net.

## Risks / Gaps
- Tests assume Unix-like shell behavior; Windows support may require adjustments.
- Mocked OpenAI responses cover happy paths; add adversarial cases (timeouts, malformed JSON) when hardening error handling.

## Related Context
- Runtime under test: [`../src/context.md`](../src/context.md).
- Approval allowlist data: [`../approved_commands.json`](../approved_commands.json).
