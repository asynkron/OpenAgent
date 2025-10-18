# Directory Context: tests/integration

## Purpose & Scope

- High-fidelity simulations of the CLI agent loop using mocked OpenAI responses and command runners.

## Key Files

- `agentLoop.integration.test.ts` — validates the interactive loop emits expected events, respects plan persistence, and handles approvals.
- `__fixtures__/openai-nested-shell-response-text.json` — captured OpenAI response payload (including the outer metadata) used to reproduce newline-heavy command payloads inside tests; now normalized to the current schema with explicit `id` labels, full shell/run command objects, and the required `max_bytes` default (aligned with `packages/core/src/constants.ts`) so schema validation passes during integration runs.
- `__fixtures__/openaiNestedShellResponse.ts` — helper that loads the captured payload and extracts the nested `responseText` string for the suites.
- `agentCancellation.integration.test.ts` — covers ESC handling and cancellation propagation across queued commands, ensuring canceled steps drop their pending command so acknowledgements don't replay the previous instruction while still allowing the assistant to retry with fresh payloads.
- `approvalFlow.integration.test.ts` — exercises auto-approval, session approvals, and human prompts end-to-end.
- `cmdStats.integration.test.ts` — tracks command statistics service wiring.
- `scripts.integration.test.ts` — smoke-tests automation scripts when invoked via the CLI runtime.
- `agentRuntimeTestHarness.ts` & `testRunnerUI.ts` — scaffolding to run the agent loop programmatically and assert emitted events, now injecting an in-memory plan manager so suites stay isolated from `.openagent/plan.json` while still exercising merge/progress logic.
- `agentRuntimeTestHarness.ts` & `testRunnerUI.ts` — scaffolding to run the agent loop programmatically and assert emitted events, now injecting an in-memory plan manager so suites stay isolated from `.openagent/plan.json` while still exercising merge/progress logic. The harness also stubs the Vercel AI SDK `streamObject` helper so offline test runs no longer depend on the real package export surface.
- `utils/cliTestHarness.ts` & `utils/planBuilder.ts` — shared CLI boot + plan helpers so integration suites configure overrides without duplicating environment setup or plan scaffolding.
- `utils/cliTestHarness.ts` — consolidates CLI bootstrapping for tests (environment priming, runtime creation, UI harness wiring) so suites only configure the command hooks they care about before queuing mocked model responses.

## Positive Signals

- Harness reuses real runtime modules (`createAgentRuntime`) while swapping in deterministic OpenAI mocks and an in-memory plan manager, so behavior closely mirrors production execution without leaking state between suites. After the TypeScript build migration the harness now stubs the compiled `dist/src/**` modules to keep assertions aligned with the runtime used by the CLI.
- Tests cover both positive flows and cancellation/approval edge cases.

## Risks / Gaps

- Command execution is mocked; real shell integration tests are absent.
- Harness complexity makes adding new scenarios non-trivial; follow existing patterns to avoid race conditions.

## Related Context

- Component-level tests: [`../unit/context.md`](../unit/context.md).
- Runtime implementation under test: [`../../packages/core/src/agent/context.md`](../../packages/core/src/agent/context.md).
