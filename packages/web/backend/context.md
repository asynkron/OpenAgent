# Directory Context: packages/web/backend

## Purpose & Scope

- WebSocket backend that proxies chat payloads between the web frontend and the core OpenAgent runtime.
- Exposes a lightweight HTTP server plus `/ws/agent` upgrade handler used by the browser UI.

## Key Files

- `src/index.ts` — boots the backend with runtime configuration derived from environment variables.
- `src/server.ts` — wraps HTTP and WebSocket server lifecycle management and now serves the
  `public/` directory (including `unified_index.html`) so the chat panel loads over regular
  HTTP.
- `src/server/agentSocket.ts` — manages runtime bindings for each connected agent websocket client (now emitting strongly typed agent payloads and stricter prompt parsing helpers). Binding setup, message routing, and teardown now live in dedicated helpers so the lifecycle is easier to follow.
- `src/server/utils.ts` — shared helpers for normalising runtime payloads and error reporting; returns typed payload objects for the websocket bridge, preserves the core runtime `__id` on every emitted event so frontends can reconcile streaming updates without duplicating rows, and now forwards assistant message `state` hints (`stream`/`final`) so the browser can switch from streaming text to rendered markdown once the response completes.
- `src/server/agentSocketMessage.ts` — parses inbound websocket payloads and forwards valid prompts to the runtime queue.
- `src/server/__tests__/` — Jest suites covering the websocket manager wiring plus payload formatting utilities.
- `public/unified_index.html` — static shell served to the browser with the agent chat
  container; seeds an empty `window.__INITIAL_STATE__` when no state payload is embedded so
  the frontend no longer crashes on load.
- `src/types/openagent-core.d.ts` — ambient bindings for the core runtime websocket adapter exposed by the CLI package.
- `src/types/ws.d.ts` — workspace-scoped typings for the `ws` package so the backend stays TypeScript-only without external @types.
- `src/server/utils.ts` — normalises runtime events by reading canonical fields from the nested
  `payload` objects emitted by the core agent while tolerating legacy flattened fields for
  compatibility.

## Build & Development

- TypeScript-only package compiled with `tsc` (NodeNext/ES2022). `npm run build` emits ESM into `dist/`.
- `npm run start` rebuilds the project before launching the compiled server (used by the repo-level `npm run start web`).
- `npm run dev` mirrors `start` but sets `NODE_ENV=development` for local overrides.

## Integration Notes

- Depends on `@asynkron/openagent-core` for the WebSocket binding; ambient typings live in `src/types/`.
- Runtime auto-approve defaults to `true` but honours `AGENT_AUTO_APPROVE=false` from the environment.
- Socket cleanup now relies on a single `cleanup` closure (no optional chaining) and treats listener removal failures as
  ignorable noise, keeping lint happy while still logging binding stop errors for operators.
