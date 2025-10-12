# Directory Context: packages/cli/src/components

## Purpose & Scope

- Ink React components and helpers responsible for rendering the CLI experience.

## Key Components

- `CliApp.js` — top-level Ink tree that wires agent runtime events into UI sections and clears completed plans from the timeline once the human submits a fresh prompt. Auto-response debug payloads (schema/protocol validation failures) now surface as warn-level timeline entries so humans get a concise summary without enabling `--debug`.
  Incoming runtime payloads are cloned before being stored so late mutations inside the agent loop can’t stall Ink re-renders, including deep-cloning plan updates so React always receives a fresh reference when the runtime mutates the active plan in place. Timeline rows now key off their locally generated identifiers so Ink’s `Static` log never suppresses new events when the runtime reuses ids during streaming updates.
- `AgentResponse.ts`, `HumanMessage.ts`, `StatusMessage.ts` — render conversational messages with markdown support.
- `Plan.ts`, `PlanDetail.ts` — visualize plan trees; `Plan.ts` focuses solely on hierarchical steps while the standalone `PlanProgress.ts` helper can still render aggregated progress when a caller opts in. Plan detail rows surface each step's current `age` alongside a truncated `command.run` preview so humans can quickly see what the agent intends to execute, and the status/age metadata now renders inline on the header row using a hyphen separator instead of a secondary bullet line.
- `Command.ts`, `renderCommand.ts`, `commandUtils.ts` — pretty-print shell commands with highlights and approval status. `Command.ts` now extracts any `*** Begin Patch` / `*** End Patch` sections from `command.run`, renders them in `diff` code fences via the shared markdown renderer, and preserves surrounding text segments.
- `ContextUsage.ts` — displays token usage (remaining context window) tracked by `contextUsage` utilities.
- `DebugPanel.ts`, `ThinkingIndicator.ts` — optional diagnostics and spinner overlays; the debug panel renders payloads via the shared markdown renderer using `json` code fences so debug data is syntax-highlighted.
- `InkTextArea.js`, `AskHuman.js` — capture human inputs and approval decisions. The text area memoizes its `useInput` handler so keystrokes always update correctly, tracks terminal resizes to rebuild width-aware rows (with newline handling) via `transformToRows`, expands to the available terminal width, respects horizontal padding when computing wrap width, filters slash menu matches by enforcing that every query token appears in a label/keyword/insertValue (preventing parenthetical examples from matching too broadly), handles Shift+Enter (including escape-based sequences) as a newline insertion rather than a submit, normalizes carriage-return/CRLF breaks when mapping strings to rows, emits explicit ANSI inverse markers for the currently highlighted slash command so the selection remains visible even when chalk-style color detection is disabled, and includes an inline debug readout (caret position, last key, modifier state, effective width from props/stdout). Slash-command normalization, caret math, and row calculations now live in `inkTextAreaUtils.ts` so the component stays focused on Ink rendering. AskHuman seeds default slash-menu shortcuts (model changes, reasoning effort, help) through `HUMAN_SLASH_COMMANDS` so humans get guided completions when typing `/` and now surfaces the active reasoning pass counter alongside the input hint when the runtime emits `pass` events.

- `CliApp.js` retains the active input request after local slash commands are handled so that the next human prompt continues to flow to the runtime/OpenAI instead of being intercepted as another slash command.

## Positive Signals

- Components are decomposed by concern, enabling targeted tests and easier adjustments to CLI layout.
- Utilities centralize formatting (e.g., `progressUtils.js`) to keep visual logic consistent across components.
- Display-focused components (plan/command/status renderers) now compile with TypeScript checks, reducing reliance on `@ts-nocheck` to the interactive shells (`CliApp`, `InkTextArea`, `AskHuman`).

## Risks / Gaps

- Rendering relies on Ink’s flexbox-like layout; test visually after major styling changes to avoid clipping.
- Markdown rendering leverages `renderMarkdownMessage` helpers; ensure new components respect sanitization rules.

## Maintenance Notes

- Layout wrappers such as `Command` and the `Timeline` container explicitly set `width: '100%'`/`alignSelf: 'stretch'`
  so timeline entries fill the terminal width consistently.
- Plan visuals now source container/heading props from `theme.plan`; adjust the theme when changing plan styling. The component now imports the `Theme` type so TypeScript understands the available plan colors/props when constructing Ink props.
- Debug panel events now carry stable identifiers (`{ id, content }`) so the panel can render without flicker when
  other animated components (thinking spinner, input caret) update the tree.
- Timeline static rows also set `flexGrow: 1` to force full-width rendering even when nested components have
  intrinsic sizing. Locally generated entry ids drive Ink’s `Static` keys so duplicate runtime identifiers from
  streaming updates do not block new rows, and assistant entries still reuse the originating runtime `__id`
  as their React key to prevent memoized subtrees from resetting.
- `Command.ts` now treats theme-driven style props as typed records instead of loose `any` maps, keeping the lint
  surface clean while preserving the flexible merge behaviour required by theme overrides.

## Related Context

- UI render helpers: [`../render.js`](../render.js).
- Runtime event producer: [`../../agent/context.md`](../../agent/context.md).
