# Directory Context: tests/unit

## Purpose & Scope

- Fine-grained Jest suites for each subsystem: agent orchestration, CLI rendering, utilities, and OpenAI integrations.

## Key Groupings

- Agent core: `commandExecution.test.js`, `approvalManager.test.js`, `responseParser.test.js`, `responseValidator.test.js`.
- Planning & context: `plan.test.js`, `planUtils.test.js`, `agentPlanProgress.test.js`, `contextUsage.test.js`.
- CLI/UI: `renderCommand.test.js`, `renderPlan.test.js`, `renderLanguage.test.js`, `CliApp` component tests, `inkTextArea.test.js` for keyboard handling/terminal resize behavior (including Shift+Enter escape sequences and CR/CRLF normalization), `promptCoordinator.test.js` covering ESC guard rails, and `askHuman.test.js` to ensure the slash menu suggestions stay wired to default shortcuts.
- Utilities: `outputUtils.test.js`, `runCommand.test.js`, `cancellation.test.js`, `index.test.js` (aggregated helpers including response extraction with `function_call` coverage). `runCommand.test.js` now asserts the runner rejects non-string payloads to enforce upstream normalization.
- Integrations: `websocketBinding.test.js`, `httpClient.test.js`, `openaiRequest.test.js`, `openaiResponses.test.js`.

## Positive Signals

- Tests validate both success and failure modes (e.g., cancellation branches, invalid response handling).
- Coverage mirrors directory structure, making it easy to find corresponding specs when editing code.
- Response parser coverage now asserts command payload normalization, newline sanitization, and reuses the captured integration fixture to guarantee the exact OpenAI payload stays parseable.
- Command execution tests verify we swap the OpenAI-facing `apply_patch` helper with the local wrapper so the runtime stays compatible
  with legacy toolchains.
- ANSI stripping helpers compute escape sequences at runtime, keeping lint satisfied without weakening terminal normalization checks.

## Risks / Gaps

- Some tests rely on snapshot-like string comparisons; keep them updated when refactoring formatting logic.
- Startup flag parsing has unit tests but no integration coverage; ensure CLI runner exercises new flags.

## Related Context

- Implementation targets: [`../../src/context.md`](../../src/context.md).
- Integration scaffolding that complements these suites: [`../integration/context.md`](../integration/context.md).
