# Directory Context: packages/web

## Purpose & Scope

- Workspace wrapper that coordinates the standalone frontend and backend packages for the OpenAgent web experience.
- Provides npm scripts that bundle the browser assets before launching the websocket backend so `npm start` from this directory boots the full web app.

## Key Scripts

- `npm run build` — bundles the frontend and compiles the backend TypeScript in sequence.
- `npm run start` — rebuilds the frontend and then starts the backend server (which recompiles itself before running).
- `npm run dev` — rebuilds the frontend once and then launches the backend in development mode.

## Related Context

- [`packages/web/frontend/context.md`](frontend/context.md)
- [`packages/web/backend/context.md`](backend/context.md)
