# OpenAgent Codebase Context

## Purpose & Scope

- Node.js CLI agent that converses with an LLM using a strict JSON protocol, renders assistant plans/messages, and executes shell commands under human approval.
- Codebase lives under `src/` (ESM). CommonJS support has been removed as of v2.0.

## Quick Directory Map

- Core runtime: [`src/context.md`](src/context.md)
- Tests: [`tests/context.md`](tests/context.md)
- Prompt/brain guidance: [`prompts/context.md`](prompts/context.md), [`brain/context.md`](brain/context.md)
- CLI assets: [`templates/context.md`](templates/context.md), [`shortcuts/context.md`](shortcuts/context.md)
- JSON schema definitions: [`schemas/context.md`](schemas/context.md)
- Release notes: [`CHANGELOG.md`](CHANGELOG.md)
- IDE settings: [`./.idea/context.md`](.idea/context.md)
- Additional docs: [`docs/context.md`](docs/context.md); root-level `README.md` and `openagent-example.md` now highlight ESM `import` snippets so newcomers avoid legacy CommonJS patterns.

## Key Entry Points

- `index.js`: re-exports the library API from `src/lib/index.js` and forwards direct execution to the CLI runner.
- `src/lib/index.js`: aggregates CLI-agnostic helpers, re-exporting the CLI runtime without owning its rendering logic.
- `src/cli/runner.js`: handles `templates`/`shortcuts` subcommands and wires CLI startup flags before launching the loop.
- `src/agent/loop.js`: orchestrates OpenAI interactions, now delegating each pass to `passExecutor.js` while managing readline/ESC state.
- `src/commands/run.js`: sandbox for process execution with timeout + cancellation; re-exports specialised helpers (browse/read/edit/replace/escape-string).

## Positive Signals

- Conversation loop responsibilities split across `loop.js`, `passExecutor.js`, `approvalManager.js`, and `commandExecution.js`, simplifying testing.
- New unit suites cover command execution, ESC waiters, and OpenAI request cancellation (`tests/unit/commandExecution.test.js`, `tests/unit/escState.test.js`, `tests/unit/openaiRequest.test.js`).
- Integration coverage now exercises approval prompts (`tests/integration/approvalFlow.integration.test.js`).
- Cancellation support aligns with findings in `docs/openai-cancellation.md`, giving ESC handling a solid foundation.
- ESC-triggered aborts now have integration coverage (`tests/integration/agentCancellation.integration.test.js`) backed by
  nested cancellation regression tests.

## Risks / Gaps

- Real shell executions remain sparsely covered in integration tests; mocked cancellation flows should be mirrored against
  actual child process lifecycles.
- Manual JSON parsing of model output pushes an observation on failure without retries/backoff.
- Keep JSON schema validation aligned with asset format changes to avoid false positives during CI/startup.
- Downstream consumers must use ESM `import()`; ensure release notes highlight the breaking change.

## Suggested First Reads for Agents

1. This file for the global picture.
2. Relevant subdirectory `context.md` files (linked above) to narrow focus quickly.
3. Associated tests (see [`tests/context.md`](tests/context.md)) to understand behavioural expectations before editing code.

# OpenAgent Codebase Context

## Purpose & Scope

- Node.js CLI agent that converses with an LLM using a strict JSON protocol, renders assistant plans/messages, and executes shell commands under human approval.
- Codebase lives under `src/` (ESM). CommonJS support has been removed as of v2.0.

## Quick Directory Map

- Core runtime: [`src/context.md`](src/context.md)
- Tests: [`tests/context.md`](tests/context.md)
- Prompt/brain guidance: [`prompts/context.md`](prompts/context.md), [`brain/context.md`](brain/context.md)
- CLI assets: [`templates/context.md`](templates/context.md), [`shortcuts/context.md`](shortcuts/context.md)
- Release notes: [`CHANGELOG.md`](CHANGELOG.md)
- IDE settings: [`./.idea/context.md`](.idea/context.md)
- Additional docs: [`docs/context.md`](docs/context.md)

## Key Entry Points

- `index.js`: delegates CLI launches to `src/cli/runner.js`, keeps the library surface re-exported for programmatic consumers.
- `src/agent/loop.js`: orchestrates OpenAI interactions, now delegating each pass to `passExecutor.js` while managing readline/ESC state.
- `src/commands/run.js`: sandbox for process execution with timeout + cancellation; re-exports specialised helpers (browse/read/edit/replace/escape-string).

## Positive Signals

- Conversation loop responsibilities split across `loop.js`, `passExecutor.js`, `approvalManager.js`, and `commandExecution.js`, simplifying testing.
- New unit suites cover command execution, ESC waiters, and OpenAI request cancellation (`tests/unit/commandExecution.test.js`, `tests/unit/escState.test.js`, `tests/unit/openaiRequest.test.js`).
- Integration coverage now exercises approval prompts (`tests/integration/approvalFlow.integration.test.js`).
- Cancellation support aligns with findings in `docs/openai-cancellation.md`, giving ESC handling a solid foundation.
- ESC-triggered aborts now have integration coverage (`tests/integration/agentCancellation.integration.test.js`) backed by
  nested cancellation regression tests.

## Risks / Gaps

- Real shell executions remain sparsely covered in integration tests; mocked cancellation flows should be mirrored against
  actual child process lifecycles.
- Manual JSON parsing of model output pushes an observation on failure without retries/backoff.
- Downstream consumers must use ESM `import()`; ensure release notes highlight the breaking change.

## Suggested First Reads for Agents

1. This file for the global picture.
2. Relevant subdirectory `context.md` files (linked above) to narrow focus quickly.
3. Associated tests (see [`tests/context.md`](tests/context.md)) to understand behavioural expectations before editing code.
