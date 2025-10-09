# Directory Context: src/cli/components

## Purpose & Scope

- Ink React components and helpers responsible for rendering the CLI experience.

## Key Components

- `CliApp.js` — top-level Ink tree that wires agent runtime events into UI sections.
- `AgentResponse.js`, `HumanMessage.js`, `StatusMessage.js` — render conversational messages with markdown support.
- `Plan.js`, `PlanDetail.js`, `PlanProgress.js` — visualize plan trees and completion state (uses `planUtils.js`, `progressUtils.js`).
- `Command.js`, `renderCommand.js`, `commandUtils.js` — pretty-print shell/read commands with highlights and approval status.
- `ContextUsage.js` — displays token usage (remaining context window) tracked by `contextUsage` utilities.
- `DebugPanel.js`, `ThinkingIndicator.js` — optional diagnostics and spinner overlays.
- `InkTextArea.js`, `AskHuman.js` — capture human inputs and approval decisions. The text area memoizes its `useInput` handler so keystrokes always update correctly, tracks terminal resizes to rebuild width-aware rows (with newline handling) via `transformToRows`, expands to the available terminal width, respects horizontal padding when computing wrap width, and includes an inline debug readout (caret position, last key, modifier state, effective width from props/stdout). Slash-menu matching now requires multi-token queries to align with an item's label or keywords so broad descriptions (for example, usage hints) no longer appear once the human narrows the command (e.g., `/model gpt-4o`). AskHuman seeds default slash-menu shortcuts (model changes, reasoning effort, help) through `HUMAN_SLASH_COMMANDS` so humans get guided completions when typing `/`.

## Positive Signals

- Components are decomposed by concern, enabling targeted tests and easier adjustments to CLI layout.
- Utilities centralize formatting (e.g., `progressUtils.js`) to keep visual logic consistent across components.

## Risks / Gaps

- Rendering relies on Ink’s flexbox-like layout; test visually after major styling changes to avoid clipping.
- Markdown rendering leverages `renderMarkdownMessage` helpers; ensure new components respect sanitization rules.

## Maintenance Notes

- Layout wrappers such as `Command` explicitly set `width: '100%'`/`alignSelf: 'stretch'` so timeline entries fill the
  terminal width consistently.

## Related Context

- UI render helpers: [`../render.js`](../render.js).
- Runtime event producer: [`../../agent/context.md`](../../agent/context.md).
