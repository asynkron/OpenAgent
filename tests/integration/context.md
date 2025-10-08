# Directory Context: tests/integration

## Purpose & Scope

- High-fidelity simulations of the CLI agent loop using mocked OpenAI responses and command runners.

## Key Files

- `agentLoop.integration.test.js` — validates the interactive loop emits expected events, respects plan persistence, and handles approvals.
- `agentRead.integration.test.js` — ensures `read` commands parse specs correctly and stream results.
- `agentCancellation.integration.test.js` — covers ESC handling and cancellation propagation across queued commands.
- `approvalFlow.integration.test.js` — exercises auto-approval, session approvals, and human prompts end-to-end.
- `cmdStats.integration.test.js` — tracks command statistics service wiring.
- `scripts.integration.test.js` — smoke-tests automation scripts when invoked via the CLI runtime.
- `agentRuntimeTestHarness.js` & `testRunnerUI.js` — scaffolding to run the agent loop programmatically and assert emitted events.

## Positive Signals

- Harness reuses real runtime modules (`createAgentRuntime`), so behavior closely mirrors production execution.
- Tests cover both positive flows and cancellation/approval edge cases.

## Risks / Gaps

- Command execution is mocked; real shell integration tests are absent.
- Harness complexity makes adding new scenarios non-trivial; follow existing patterns to avoid race conditions.

## Related Context

- Component-level tests: [`../unit/context.md`](../unit/context.md).
- Runtime implementation under test: [`../../src/agent/context.md`](../../src/agent/context.md).
