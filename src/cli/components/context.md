# Directory Context: src/cli/components

## Purpose & Scope

- Ink React components and helpers responsible for rendering the CLI experience.

## Key Components

- `CliApp.js` — top-level Ink tree that wires agent runtime events into UI sections.
- `AgentResponse.js`, `HumanMessage.js`, `StatusMessage.js` — render conversational messages with markdown support.
- `Plan.js`, `PlanDetail.js`, `PlanProgress.js` — visualize plan trees and completion state (uses `planUtils.js`, `progressUtils.js`).
- `Command.js`, `renderCommand.js`, `commandUtils.js` — pretty-print shell commands with highlights and approval status. `Command.js` now extracts any `*** Begin Patch` / `*** End Patch` sections from `command.run`, renders them in `diff` code fences via the shared markdown renderer, and preserves surrounding text segments.
- `ContextUsage.js` — displays token usage (remaining context window) tracked by `contextUsage` utilities.
- `DebugPanel.js`, `ThinkingIndicator.js` — optional diagnostics and spinner overlays; the debug panel renders payloads via the shared markdown renderer using `json` code fences so debug data is syntax-highlighted.
- `InkTextArea.js`, `AskHuman.js` — capture human inputs and approval decisions. The text area memoizes its `useInput` handler so keystrokes always update correctly, tracks terminal resizes to rebuild width-aware rows (with newline handling) via `transformToRows`, expands to the available terminal width, respects horizontal padding when computing wrap width, filters slash menu matches by enforcing that every query token appears in a label/keyword/insertValue (preventing parenthetical examples from matching too broadly), handles Shift+Enter (including escape-based sequences) as a newline insertion rather than a submit, normalizes carriage-return/CRLF breaks when mapping strings to rows, emits explicit ANSI inverse markers for the currently highlighted slash command so the selection remains visible even when chalk-style color detection is disabled, and includes an inline debug readout (caret position, last key, modifier state, effective width from props/stdout). AskHuman seeds default slash-menu shortcuts (model changes, reasoning effort, help) through `HUMAN_SLASH_COMMANDS` so humans get guided completions when typing `/`.

## Positive Signals

- Components are decomposed by concern, enabling targeted tests and easier adjustments to CLI layout.
- Utilities centralize formatting (e.g., `progressUtils.js`) to keep visual logic consistent across components.

## Risks / Gaps

- Rendering relies on Ink’s flexbox-like layout; test visually after major styling changes to avoid clipping.
- Markdown rendering leverages `renderMarkdownMessage` helpers; ensure new components respect sanitization rules.

## Maintenance Notes

- Layout wrappers such as `Command` and the `Timeline` container explicitly set `width: '100%'`/`alignSelf: 'stretch'`
  so timeline entries fill the terminal width consistently.
- Debug panel events now carry stable identifiers (`{ id, content }`) so the panel can render without flicker when
  other animated components (thinking spinner, input caret) update the tree.
- Timeline static rows also set `flexGrow: 1` to force full-width rendering even when nested components have
  intrinsic sizing, and assistant entries reuse the originating runtime `__id` as their React key to prevent
  memoized subtrees from resetting.

## Related Context

- UI render helpers: [`../render.js`](../render.js).
- Runtime event producer: [`../../agent/context.md`](../../agent/context.md).
