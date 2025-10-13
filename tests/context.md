# Directory Context: tests

## Purpose & Scope

- Jest-based suites that exercise cross-package scenarios (for example the CLI bootstrapping through the runtime). Includes shared mocks.
- Acts as the shared home for integration suites that exercise multiple packages now that unit tests live alongside the code in
  `packages/core` and `packages/cli`.

## Key Areas

- `integration/` — orchestrates full agent runs using a mocked OpenAI backend. See [`integration/context.md`](integration/context.md).
- `mockOpenAI.ts` — fixture exposing deterministic OpenAI responses for integration harnesses.
- `stubs/` — local ESM shims for external AI SDKs so Jest can resolve modules that suites immediately mock. See [`stubs/context.md`](stubs/context.md).
- `ink-testing-library` dev dependency drives terminal keystroke simulation for CLI component specs.

## Positive Signals

- Integration harness (`agentRuntimeTestHarness.ts`) simulates CLI runtime, ensuring plan updates, command execution, and cancellation all cooperate while now isolating plan state in-memory so suites do not depend on `.openagent/plan.json`.
- Package-level unit suites now live under `packages/core/src/**/__tests__` and `packages/cli/src/**/__tests__` (now authored in TypeScript), so regression
  coverage travels with the implementation modules.
- Recent unit tests under each package assert tool-only OpenAI responses remain parseable, guard the CLI renderers, and cover
  cancellation/plan utilities without depending on the repository-level harness.
- OpenAI mocking utilities now keep their enablement flag immutable, preventing accidental toggles mid-suite.
- The shared OpenAI mock rewrites `.js` module specifiers to `.ts`, `.tsx`, or `.jsx` when only the authored sources exist, keeping Babel-powered Jest runs aligned with the workspace migration.

## Risks / Gaps

- Tests assume Unix-like shell behavior; Windows support may require adjustments.
- Mocked OpenAI responses cover happy paths; add adversarial cases (timeouts, malformed JSON) when hardening error handling.

## Related Context

- Runtime under test: [`../packages/core/src/context.md`](../packages/core/src/context.md).
- Approval allowlist data: [`../approved_commands.json`](../approved_commands.json).
- Package-level structure and guidance for co-locating future unit tests: [`../docs/workspace-structure.md`](../docs/workspace-structure.md).
