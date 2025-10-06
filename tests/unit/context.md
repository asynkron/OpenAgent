# Directory Context: tests/unit

## Purpose

- Fine-grained Jest suites covering utilities, rendering, command helpers, and module exports.

## Representative Tests

- `agentBuiltins.test.js`: verifies `read`/`browse` commands with quoted arguments route to correct runners.
- `applyFileEdits.test.js`, `editText.test.js`: ensure positional edits behave and validate ranges.
- `cancellation.test.js`: exercises stack-based cancellation semantics.
- `renderLanguage.test.js`, `renderPlan.test.js`: guard CLI rendering edge cases.
- `replaceCommand.test.js`, `runCommand.test.js`: verify replacement logic and process management.
- `index.test.js`, `esmEntry.test.js`: confirm root exports and ESM package surface remain intact.
- `openaiResponses.test.js`: validates the shared OpenAI response helper respects reasoning environment overrides.
- `historyCompactor.test.js`: asserts old history is summarized and that the generated summary is surfaced to the human via logging.

## Positive Signals

- Strong coverage of utility surfaces reduces risk of regressions during refactors.

## Risks / Gaps

- Missing tests for `escapeString`/`unescapeString` helpers, `runBrowse` timeout handling, and prompt builder behaviour.
- Some tests mock modules heavily, making them brittle when file paths or module boundaries shift.

## Related Context

- Source modules under test: [`../../src/context.md`](../../src/context.md)
- Integration counterparts: [`../integration/context.md`](../integration/context.md)
