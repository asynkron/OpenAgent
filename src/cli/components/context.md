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
- `InkTextArea.js`, `AskHuman.js` — capture human inputs and approval decisions.

## Positive Signals
- Components are decomposed by concern, enabling targeted tests and easier adjustments to CLI layout.
- Utilities centralize formatting (e.g., `progressUtils.js`) to keep visual logic consistent across components.

## Risks / Gaps
- Rendering relies on Ink’s flexbox-like layout; test visually after major styling changes to avoid clipping.
- Markdown rendering leverages `renderMarkdownMessage` helpers; ensure new components respect sanitization rules.

## Related Context
- UI render helpers: [`../render.js`](../render.js).
- Runtime event producer: [`../../agent/context.md`](../../agent/context.md).
