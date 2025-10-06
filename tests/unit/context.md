# Directory Context: tests/unit

## Purpose

- Fine-grained Jest suites covering utilities, rendering, command helpers, and module exports.

## Representative Tests

- `agentBuiltins.test.js`: verifies `read`/`browse` commands with quoted arguments route to correct runners.
- `applyFileEdits.test.js`, `editText.test.js`: ensure positional edits behave and validate ranges.
- `cancellation.test.js`: exercises stack-based cancellation semantics, including nested cascades.
- `renderLanguage.test.js`, `renderPlan.test.js`: guard CLI rendering edge cases, including the status-icon format from the refreshed plan renderer.
- `replaceCommand.test.js`, `runCommand.test.js`: verify replacement logic and process management.
- `httpClient.test.js`: exercises fetch vs Node fallbacks, timeout aborts, and timeout resolution for the shared HTTP client.
- `index.test.js`, `esmEntry.test.js`: confirm root exports and ESM package surface remain intact.
- `openaiResponses.test.js`: validates the shared OpenAI response helper respects reasoning environment overrides.
- `jsonAssetValidator.test.js`: guards JSON schema helpers and prompt synchronization checks.
- `historyCompactor.test.js`: asserts old history is summarized and that the generated summary is surfaced to the human via logging.
- `websocketUi.test.js`: exercises the WebSocket UI binding to ensure prompts/events route correctly and disconnections cancel the runtime.

## Positive Signals

- Strong coverage of utility surfaces reduces risk of regressions during refactors.

## Risks / Gaps

- Remaining gaps include `runBrowse` timeout handling and prompt builder behaviour; cancellation still uses mocks instead of real child processes.
- Some tests mock modules heavily, making them brittle when file paths or module boundaries shift.

## Related Context

- Source modules under test: [`../../src/context.md`](../../src/context.md)
- Integration counterparts: [`../integration/context.md`](../integration/context.md)
