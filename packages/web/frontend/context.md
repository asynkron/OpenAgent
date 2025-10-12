# Directory Context: packages/web/frontend

## Purpose & Scope

- Static web frontend for the OpenAgent web experience.
- Bundled with esbuild into the backend's `public/static/dist` directory.
- Hosts chat panel UI, document viewer helpers, and layout bootstrap utilities.

## Key Components

- `src/js/` — TypeScript sources for chat services, plan renderer, and unified application bootstrap logic.
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
