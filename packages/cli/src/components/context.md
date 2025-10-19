# Directory Context: packages/cli/src/components

## Purpose & Scope

- Ink React components and helpers responsible for rendering the CLI experience.

## Key Components

- `CliApp.tsx` — top-level Ink tree that wires agent runtime events into UI sections and clears completed plans from the timeline once the human submits a fresh prompt. Auto-response debug payloads (schema/protocol validation failures) now surface as warn-level timeline entries so humans get a concise summary without enabling `--debug`. Assistant responses queue until command execution settles so the timeline shows commands before the summarised reply, and the handler now preserves structured assistant payloads instead of forcing them to empty strings so the timeline never drops a valid response row. The assistant message handler now asserts the runtime continues to emit string `__id` values so protocol regressions trigger a fast TypeError instead of silently corrupting the timeline. Plan updates no longer seed speculative command placeholders; the timeline adds command rows only after execution events arrive with success or failure outcomes. The AskHuman input is memoised so caret visibility changes stay local without cascading into unnecessary rerenders of the rest of the CLI whenever other state updates land.
  Incoming runtime payloads are cloned before being stored so late mutations inside the agent loop can’t stall Ink re-renders, including deep-cloning plan updates so React always receives a fresh reference when the runtime mutates the active plan in place. Timeline rows now render strictly in arrival order (no `<Static>` buckets), so human prompts, executed commands, and assistant replies stay interleaved chronologically even as the timeline grows. Runtime-provided `__id` values are reused for both assistant and command entries, avoiding plan-step id reuse across passes while still allowing repeated updates of the same command. The file now delegates slash-command parsing and timeline rendering to `cliApp/slashCommands.ts` and `cliApp/Timeline.tsx`, keeping the component focused on state orchestration with idiomatic TypeScript types.
  Stable refs keep the slash-command handlers and prompt submission callback from triggering AskHuman rerenders when the plan progress or command log updates.
- Timeline, debug log, command history, and history export responsibilities now live in focused hooks under `cliApp/use*.ts`, keeping the component primarily concerned with wiring runtime events into UI primitives. The shared timeline append contract now lives in `cliApp/types.ts` so every hook relies on the same strongly typed signature when queuing entries.
- `cliApp/useCommandLog.ts` now delegates payload cloning and inspector parsing to `cliApp/commandLogHelpers.ts`, keeping the hook small while the slash command continues to report how many entries are shown and clamps invalid counts before updating state. Helpers now operate exclusively on finalized command-result events, aligning the inspector with the trimmed timeline surface.
- `AgentResponse.tsx`, `HumanMessage.tsx`, `StatusMessage.tsx` — render conversational messages with markdown support.
- `Plan.tsx`, `PlanDetail.tsx` — visualize plan trees; `Plan.tsx` focuses solely on hierarchical steps while plan detail rows surface status, priority, dependency metadata, and a truncated `command.run` preview so humans can quickly see what the agent intends to execute, rendering the metadata inline on the header row instead of a secondary bullet list.
- `Command.tsx`, `commandUtils.ts` — pretty-print shell commands with highlights and approval status. `Command.tsx` now extracts any `*** Begin Patch` / `*** End Patch` sections from `command.run`, renders them in `diff` code fences via the shared markdown renderer, and preserves surrounding text segments. Timeline rows display a macOS-style window chrome plus the parent plan step id/title above each command so humans can associate output with the originating plan. The command heading swaps the textual action badge for a green `❯` icon, and the run command preview renders through a `bash` code fence (truncated to 270 characters by default via a prop) to keep long commands readable. Single-line execute commands now reuse that syntax-highlighted preview inline with the prompt so `❯ echo hello` shows the coloured shell tokens on one row. Supporting pieces that used to live inline now reside under `command/` (theme cloning, plan headings, run preview renderer, summary builders, and preview normalisers) so the main component focuses on layout and data orchestration while `commandUtils.ts` simply re-exports the smaller helpers.
  Command rows render collapsed by default; the header shows only the plan step context plus a status emoji that reflects runtime outcomes (`✅` success, `❌` failure/killed, `▶️` running, `⏳` waiting on dependencies, `💤` pending). The body (run preview, observations, exit payload) only appears when timeline hotkeys expand the commands.
- `ContextUsage.tsx` — displays token usage (remaining context window) tracked by `contextUsage` utilities.
- `DebugPanel.tsx` — optional diagnostics overlay reused by the command inspector; the CLI no longer renders the streaming AI SDK debug feed by default, but the component continues to format payloads via the shared markdown renderer using `json` code fences so command details stay readable.
- `InkTextArea.tsx`, `AskHuman.tsx` — capture human inputs and approval decisions. The text area memoizes its `useInput` handler so keystrokes always update correctly, tracks terminal resizes to rebuild width-aware rows (with newline handling) via `transformToRows`, expands to the available terminal width, respects horizontal padding when computing wrap width, and now subtracts the AskHuman container/input padding when deriving the live width so rendered rows align with Ink’s layout even as themes tweak margins. It filters slash menu matches by enforcing that every query token appears in a label/keyword/insertValue (preventing parenthetical examples from matching too broadly), handles Shift+Enter (including escape-based sequences) as a newline insertion rather than a submit, normalizes carriage-return/CRLF breaks when mapping strings to rows, emits explicit ANSI inverse markers for the currently highlighted slash command so the selection remains visible even when chalk-style color detection is disabled, and includes an inline debug readout (caret position, last key, modifier state, effective width from props/stdout). Key event parsing now flows through dedicated helpers in `inkTextArea/keyEvents.ts`, keeping the primary `useInput` callback focused on routing actions. Caret blinking is now isolated inside a memoised `InkTextAreaRows` subcomponent so the interval that toggles the caret only re-renders the row output instead of the whole input wrapper, keeping the rest of the CLI stable while the cursor animates. AskHuman seeds default slash-menu shortcuts (model changes, reasoning effort, help) through `HUMAN_SLASH_COMMANDS` exported from `askHumanCommands.ts`, surfaces the active reasoning pass counter alongside the input hint when the runtime emits `pass` events, and now pulls themed styles through dedicated helpers in `askHumanViewProps.ts` plus the `useAskHumanInput` hook so the component stays lean while remaining under strict TypeScript checks without `@ts-nocheck`. Rendering lives in `AskHumanLayout.tsx`, keeping the top-level component focused on wiring the input hook. The hint text shown beneath the input is formatted in `askHumanHint.ts` so the component only coordinates layout and handlers. Supporting helpers live in `inkTextArea/commands.ts` and `inkTextArea/layout.ts` to keep slash-command parsing and layout math isolated for reuse and testing. The command palette renderer now lives in `inkTextArea/CommandMenu.tsx`, and shared hooks (`inkTextArea/useStdoutWidth.ts`, `inkTextArea/useCaretBlink.ts`) encapsulate terminal measurement and caret blinking so the primary component stays focused on wiring handlers.
- `CliApp.tsx` — still orchestrates the Ink tree, but reusable utilities (history persistence, debug summarisation, bounded list helpers) now live alongside it under `cliApp/` so event handlers stay lean.
- `cliApp/Timeline.tsx` memoises the timeline presentation and centralises the assistant/human/command/banner renderers so `CliApp.tsx` can render via a single component prop. Each row now renders through a memoised wrapper keyed by the entry object, preventing stream updates or caret blinking in sibling areas from forcing full timeline redraws.
- `cliApp/useRuntimeEventRouter.ts` precomputes a map of runtime event handlers so `CliApp.tsx` only wires state setters into the router instead of switching on each event type.
- `cliApp/slashCommands.ts` owns slash-command parsing plus the memoised router hook shared by the Ink app and AskHuman input. A pure router factory keeps the React hook thin and now has direct unit coverage.
- `cliApp/runtimeUtils.ts` re-exports the focused helpers under `cliApp/runtimeUtils/` so `CliApp.tsx` can import cloning, status normalisation, and integer parsing utilities without touching their implementations. The clone helper prefers the native structured clone and falls back to JSON cloning only when required; regression tests for these utilities live beside the module.

- `CliApp.tsx` retains the active input request after local slash commands are handled so that the next human prompt continues to flow to the runtime/OpenAI instead of being intercepted as another slash command.
- `CliApp.tsx` now parses slash commands via a memoized handler map, keeping the routing logic compact while letting individual commands reuse shared helpers for validation and status reporting.
- `cliApp/types.ts` no longer maintains ad-hoc runtime event shapes; it imports the canonical contracts from `@asynkron/openagent-core`, re-exports the handful of events the rest of the components rely on, and centralises derived payload types (timeline entries, slash-command helpers, runtime error payloads) so the Ink components all lean on the same surface.

## Positive Signals

- Components are decomposed by concern, enabling targeted tests and easier adjustments to CLI layout.
- Utilities centralize formatting (e.g., `progressUtils.js`) to keep visual logic consistent across components.
- Display-focused components (plan/command/status renderers) now compile with TypeScript checks, and the interactive shells continue to run under strict TypeScript (`CliApp`, `InkTextArea`, `AskHuman`).
- `PlanDetail` test coverage exercises command preview rendering and metadata fallbacks directly against the TSX source so Jest/ESM resolution stays aligned with the component.

## Risks / Gaps

- Rendering relies on Ink’s flexbox-like layout; test visually after major styling changes to avoid clipping.
- Markdown rendering leverages `renderMarkdownMessage` helpers; ensure new components respect sanitization rules.

## Maintenance Notes

- Layout wrappers such as `Command` and the `Timeline` container explicitly set `width: '100%'` and `flexGrow: 1`
  so timeline entries fill the terminal width consistently, and all components now render via TSX/JSX rather than
  `React.createElement` helpers for readability.
- Plan visuals now source container/heading props from `theme.plan`; adjust the theme when changing plan styling. The component now imports the `Theme` type so TypeScript understands the available plan colors/props when constructing Ink props.
- Debug panel events now carry stable identifiers (`{ id, content }`) so the panel can render without flicker when
  localised AskHuman updates (input caret, thinking indicator) update the tree.
- Timeline rows also set `flexGrow: 1` to force full-width rendering even when nested components have
  intrinsic sizing. Locally generated entry ids still stabilise ordering, and assistant entries reuse the originating runtime `__id`
  as their React key so memoized subtrees keep streaming updates without flicker.
- The timeline hook short-circuits assistant/command upserts when payloads stay identical so Ink keeps previously rendered rows in place and avoids frame flicker while streaming tokens.
- Command entries now apply the theme-provided border on the outer wrapper so the plan header and body
  render inside a single white rounded frame by default, while still allowing overrides through the theme.
- `Command.tsx` now treats theme-driven style props as typed records instead of loose `any` maps, keeping the lint
  surface clean while preserving the flexible merge behaviour required by theme overrides.
- `CliApp.tsx` keeps lint noise down by only importing the history snapshot helper that remains in use; the unused
  resolver import has been trimmed.
- Shared helpers such as `commandUtils.ts`, `planUtils.ts`, `progressUtils.ts`, and the Ink text area hooks now expose
  only named exports so tree-shaking and dead-code analyzers no longer report unused default facades.
- InkTextArea regression tests live in focused suites (`InkTextArea.input.test.ts`, `InkTextArea.slash-menu.test.ts`,
  `InkTextArea.transform.test.ts`) with shared helpers under `test-utils/` so caret/command behaviours can evolve
  independently without editing a monolithic spec. The shared `waitForInkUpdates()` test helper now blocks for Ink’s
  scheduler (command menu debounce, resize debounce) before assertions so specs stay stable on React 19/Ink 6.

## Related Context

- UI render helpers: [`../render.js`](../render.js).
- Runtime event producer: [`../../agent/context.md`](../../agent/context.md).


## Flicker mitigation (2025-10)
- Debounce terminal resize in useStdoutWidth to ~120ms.
- Cap thinking animation tick to ~120ms (≈8 FPS).
- Memoize presentational components (e.g., Command).
- Prefer <Static> for finalized timeline entries (future refactor).
- Use stable keys (ids), avoid index keys.
- Avoid direct stdout writes; render via Ink.

## Update: Timeline hybrid rendering and input stabilization (2025-10-19)
- Hybrid Timeline rendering:
  - Finalized entries render via Ink <Static> (frozen, no re-diff).
  - Only in-progress items render live (streaming assistant and any in-flight command/status).
  - Result: history doesn’t repaint while typing/streaming; flicker is reduced.
- Strict chronology:
  - Arrival-order map ensures items render in first-seen order, even if upstream arrays temporarily reorder.
  - Arrival tracking now initialises before the empty-state guard so React’s hook order stays stable even when the first
    render receives no entries (React 19 surfaced the violation).
- Input stability:
  - Text area uses a fixed-height window (default 6 rows) with internal scrolling; long prompts no longer grow the outer layout.
  - Local echo stays responsive; `debounceOnChangeMs` remains available but now defaults to immediate `onChange` calls so tests and live typing observe the latest value without waiting.
- Hotkeys:
  - e = expand all commands
  - c = collapse all commands
- Notes:
  - Flicker previously disappeared when “Submit prompts to drive the conversation.” was visible because Static lines stabilized the viewport. The hybrid model preserves that benefit while keeping streaming.
