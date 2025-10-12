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
