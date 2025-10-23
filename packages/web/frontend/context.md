# Directory Context: packages/web/frontend

## Purpose & Scope

- Static web frontend for the OpenAgent web experience.
- Bundled with esbuild into the backend's `public/static/dist` directory.
- Hosts chat panel UI, document viewer helpers, and layout bootstrap utilities.

## Key Components

- `src/js/` — TypeScript sources for chat services, plan renderer, and unified application bootstrap logic. Chat wiring now reuses `services/chat_highlight.ts`, `services/chat_dom.ts`, and `services/chat_domController.ts` to keep markdown rendering, DOM listener utilities, and UI mutations isolated from the main chat orchestrator; helper controllers (`services/chat_sessionController.ts`, `services/chat_actionRunner.ts`, and `services/chat_lifecycle.ts`) further split session state, action dispatch, and socket wiring from `services/chat.ts`.
- `src/css/` — Stylesheets bundled alongside JavaScript for the frontend UI.
- `scripts/ensure-esbuild.mjs` — Rebuild helper guaranteeing esbuild binary compatibility before bundling.
- `src/css/vendor/` — Checked-in copies of the third-party stylesheets (and Font Awesome webfonts) that the app imports so CSS bundling works without the corresponding npm packages present.

## Build & Tooling

- Run `npm run build` from this package to bundle TypeScript and CSS assets via esbuild.
- Output files land in `packages/web/backend/public/static/dist` for server consumption.
- Dependency resolution is driven by the workspace root `package-lock.json`; this package no longer keeps an independent lockfile,
  so install dependencies via the repository root to avoid stale module sets during builds.

## Recent Changes

- Migrated all JavaScript sources to TypeScript and now bundle from `src/js/unified_index.ts`.
- Replaced legacy global Markdown/highlight wiring with direct module imports for `marked` and `highlight.js`.
- Added richer type definitions across chat services, viewer helpers, and bootstrap routines to improve safety under strict TypeScript settings.
- Strengthened the file-index bootstrap helpers and shared context state with explicit `FileEntry`/`FileTreeEntry` types, removing `unknown` plumbing from navigation flows.
- Introduced Jest coverage for the bootstrap helpers (tree building, CSS utilities, and fallback reset orchestration) to guard the TypeScript migration.
- Split shared chat and plan logic into `src/js/services/chat_model.ts` and `src/js/components/plan_model.ts` so DOM wiring stays lean and unit tests can target the pure helpers.
- Added Jest suites under `src/js/**/__tests__` to cover plan aggregation and chat payload normalisation utilities.
- Markdown rendering now initialises Mermaid for ```mermaid fences and includes targeted Jest coverage for the display helper.
- Markdown rendering now reapplies highlight.js syntax highlighting in the DOM after parsing so fenced code blocks retain their
  theme even under the latest Marked release.
- Mermaid diagrams now stay as plain code blocks until their definitions parse successfully, preventing streaming-time rendering errors and deferring Mermaid initialisation until the content stabilises.
- Command result panels now highlight recorded shell commands using the reported interpreter and render stdout as plain text while emphasising stderr with a red tone for quicker scanning.
- Chat DOM handling now streams assistant updates through the markdown renderer while deferring Mermaid hydration until the runtime marks the message as `state: "final"`, preserving formatting mid-stream without repeatedly initialising diagrams.
- Streamlined chat, shared context, and bootstrap helpers with stricter TypeScript unions and optional chaining, replacing runtime `typeof` guards with typed utilities for cleaner DOM event handling.
- Refined chat payload routing with a typed handler map and removed the last `unknown` casts from markdown rendering to keep syntax highlighting and message handling strictly typed.
- Pruned unused helper typings in shared context/tests so ESLint stays quiet under the expanded repo-wide lint run.
- Extracted helper utilities inside `services/chat.ts` to normalise event payloads before rendering, reducing duplicated DOM-building logic when displaying agent banners and status messages.
- Updated the chat layout CSS so the standalone page stretches the agent panel cleanly now that the file and ToC sidebars are no longer rendered in the static HTML scaffold.
- Agent chat bubbles now drop their decorative background, border, and shadow so assistant responses display directly on the page surface, matching the simplified ChatGPT look.
- Assistant responses now stretch to the full message width so the invisible bubble footprint no longer caps line length on wide viewports.
- `services/chat.ts` now centralises message container creation/append helpers so message, event, and command renders share the same DOM plumbing instead of repeating wrapper scaffolding.
- Panel activation toggles now share a dedicated helper so conversation start and reset flows reuse the same DOM updates without duplicating focus/visibility logic.
- Hardened the chat WebSocket handler with a stale-socket guard and consolidated command preview rendering so reconnects and code blocks reuse shared helpers.
- Introduced a generic DOM element factory plus event display resolver map inside `services/chat.ts`, trimming repeated node construction and clarifying how banner/status payloads pick their headers and bodies.
- Split the chat event display heuristics into `services/chat_eventDisplay.ts`, exposing typed helpers for banner/status body selection and command preview normalisation.
- WebSocket lifecycle cleanup now removes listeners and ignores stale socket messages in `services/chat.ts`, preventing duplicate renders after reconnects and reducing memory pressure during repeated reconnect cycles.
- Extracted DOM mutations into `services/chat_domController.ts` so `services/chat.ts` focuses on socket orchestration while the controller manages message rendering, status updates, and plan display resets.
- Further decomposed the chat orchestration into `chat_socket.ts`, `chat_router.ts`, and `chat_inputController.ts` so socket lifecycle, payload routing, and input handling stay isolated and testable; new Jest suites cover reconnection, routing, and queued input dispatch behaviour.
- Refactored the chat entrypoint to compose `chat_bootstrap.ts`, `chat_lifecycle.ts`, and `chat_sessionController.ts`, pushing socket observers, pending-queue prompts, and DOM bootstrap glue into dedicated modules while tightening discriminated-union typings across lifecycle events.
- Retired the unused terminal dock panel styling and element plumbing so the agent chat stands alone.
- Synced Mermaid diagram CSS overrides (including the global path/cluster tweaks) from Asynkron.LiveView into `src/css/mermaid-overrides.css`, import them from `app.css`, and mirror the upstream dark-theme Mermaid initialisation so diagrams match the LiveView look and feel.
- Updated the `.agent-message--user` bubble styling to use the requested brand blue background and glow.
