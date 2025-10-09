# Directory Context: tests/unit

## Purpose & Scope

- Fine-grained Jest suites for each subsystem: agent orchestration, CLI rendering, utilities, and OpenAI integrations.

## Key Groupings

- Agent core: `commandExecution.test.js`, `approvalManager.test.js`, `responseParser.test.js`, `responseValidator.test.js`.
- Planning & context: `plan.test.js`, `planUtils.test.js`, `agentPlanProgress.test.js`, `contextUsage.test.js`.
- CLI/UI: `renderCommand.test.js`, `renderPlan.test.js`, `renderLanguage.test.js`, `CliApp` component tests, `inkTextArea.test.js` for keyboard handling and terminal resize behavior.
- Utilities: `outputUtils.test.js`, `readSpec.test.js`, `runCommand.test.js`, `cancellation.test.js`, `index.test.js` (aggregated helpers including response extraction with `function_call` coverage).
- Integrations: `websocketBinding.test.js`, `httpClient.test.js`, `openaiRequest.test.js`, `openaiResponses.test.js`.

## Positive Signals

- Tests validate both success and failure modes (e.g., cancellation branches, invalid response handling).
- Response validator suite now mirrors the shared JSON schema via Ajv, catching malformed execute/read payloads before they reach the runtime.
- Coverage mirrors directory structure, making it easy to find corresponding specs when editing code.

## Risks / Gaps

- Some tests rely on snapshot-like string comparisons; keep them updated when refactoring formatting logic.
- Startup flag parsing has unit tests but no integration coverage; ensure CLI runner exercises new flags.

## Related Context

- Implementation targets: [`../../src/context.md`](../../src/context.md).
- Integration scaffolding that complements these suites: [`../integration/context.md`](../integration/context.md).
