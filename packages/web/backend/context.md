# Directory Context: packages/web/backend

## Purpose & Scope
- WebSocket backend that proxies chat payloads between the web frontend and the core OpenAgent runtime.
- Exposes a lightweight HTTP server plus `/ws/agent` upgrade handler used by the browser UI.

## Key Files
- `src/index.ts` — boots the backend with runtime configuration derived from environment variables.
- `src/server.ts` — wraps HTTP and WebSocket server lifecycle management.
- `src/server/agentSocket.ts` — manages runtime bindings for each connected agent websocket client.
- `src/server/utils.ts` — shared helpers for normalising runtime payloads and error reporting.
- `src/types/openagent-core.d.ts` — ambient bindings for the core runtime websocket adapter exposed by the CLI package.
- `src/types/ws.d.ts` — workspace-scoped typings for the `ws` package so the backend stays TypeScript-only without external @types.

## Build & Development
- TypeScript-only package compiled with `tsc` (NodeNext/ES2022). `npm run build` emits ESM into `dist/`.
- `npm run start` rebuilds the project before launching the compiled server (used by the repo-level `npm run start web`).
- `npm run dev` mirrors `start` but sets `NODE_ENV=development` for local overrides.

## Integration Notes
- Depends on `@asynkron/openagent-core` for the WebSocket binding; ambient typings live in `src/types/`.
- Runtime auto-approve defaults to `true` but honours `AGENT_AUTO_APPROVE=false` from the environment.
