# Directory Context: packages/web/frontend

## Purpose & Scope

- Static web frontend for the OpenAgent web experience.
- Bundled with esbuild into the backend's `public/static/dist` directory.
- Hosts chat panel UI, document viewer helpers, and layout bootstrap utilities.

## Key Components

- `src/js/` — TypeScript sources for chat services, plan renderer, and unified application bootstrap logic. Chat wiring now reuses `services/chat_highlight.ts`, `services/chat_dom.ts`, and `services/chat_domController.ts` to keep markdown rendering, DOM listener utilities, and UI mutations isolated from the main chat orchestrator; helper controllers (`services/chat_session.ts`, `services/chat_actionRunner.ts`, and `services/chat_connection.ts`) further split session state, action dispatch, and socket wiring from `services/chat.ts`.
- `src/css/` — Stylesheets bundled alongside JavaScript for the frontend UI.
- `scripts/ensure-esbuild.mjs` — Rebuild helper guaranteeing esbuild binary compatibility before bundling.

## Build & Tooling

- Run `npm run build` from this package to bundle TypeScript and CSS assets via esbuild.
- Output files land in `packages/web/backend/public/static/dist` for server consumption.

## Recent Changes

- Migrated all JavaScript sources to TypeScript and now bundle from `src/js/unified_index.ts`.
- Replaced legacy global Markdown/highlight wiring with direct module imports for `marked` and `highlight.js`.
- Added richer type definitions across chat services, viewer helpers, and bootstrap routines to improve safety under strict TypeScript settings.
- Strengthened the file-index bootstrap helpers and shared context state with explicit `FileEntry`/`FileTreeEntry` types, removing `unknown` plumbing from navigation flows.
- Introduced Jest coverage for the bootstrap helpers (tree building, CSS utilities, and fallback reset orchestration) to guard the TypeScript migration.
- Split shared chat and plan logic into `src/js/services/chat_model.ts` and `src/js/components/plan_model.ts` so DOM wiring stays lean and unit tests can target the pure helpers.
- Added Jest suites under `src/js/**/__tests__` to cover plan aggregation and chat payload normalisation utilities.
- Streamlined chat, shared context, and bootstrap helpers with stricter TypeScript unions and optional chaining, replacing runtime `typeof` guards with typed utilities for cleaner DOM event handling.
- Refined chat payload routing with a typed handler map and removed the last `unknown` casts from markdown rendering to keep syntax highlighting and message handling strictly typed.
- Pruned unused helper typings in shared context/tests so ESLint stays quiet under the expanded repo-wide lint run.
- Extracted helper utilities inside `services/chat.ts` to normalise event payloads before rendering, reducing duplicated DOM-building logic when displaying agent banners and status messages.
- `services/chat.ts` now centralises message container creation/append helpers so message, event, and command renders share the same DOM plumbing instead of repeating wrapper scaffolding.
- Panel activation toggles now share a dedicated helper so conversation start and reset flows reuse the same DOM updates without duplicating focus/visibility logic.
- Hardened the chat WebSocket handler with a stale-socket guard and consolidated command preview rendering so reconnects and code blocks reuse shared helpers.
- Introduced a generic DOM element factory plus event display resolver map inside `services/chat.ts`, trimming repeated node construction and clarifying how banner/status payloads pick their headers and bodies.
- Split the chat event display heuristics into `services/chat_eventDisplay.ts`, exposing typed helpers for banner/status body selection and command preview normalisation.
- WebSocket lifecycle cleanup now removes listeners and ignores stale socket messages in `services/chat.ts`, preventing duplicate renders after reconnects and reducing memory pressure during repeated reconnect cycles.
- Extracted DOM mutations into `services/chat_domController.ts` so `services/chat.ts` focuses on socket orchestration while the controller manages message rendering, status updates, and plan display resets.
- Further decomposed the chat orchestration into `chat_socket.ts`, `chat_router.ts`, and `chat_inputController.ts` so socket lifecycle, payload routing, and input handling stay isolated and testable; new Jest suites cover reconnection, routing, and queued input dispatch behaviour.
