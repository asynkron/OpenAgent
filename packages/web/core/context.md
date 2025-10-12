# Directory Context: packages/web/core

## Purpose & Scope

- Shared TypeScript package used by the web backend and frontend for event normalisation utilities.
- Hosts serialisation helpers that translate runtime websocket events into browser-friendly payloads.
- Provides strongly-typed helpers for sanitising agent text before it is displayed.

## Key Files

- `package.json` — workspace manifest exporting the compiled helpers from `dist/`.
- `src/text.ts` — utilities for consistently normalising text emitted by the agent runtime.
- `src/events.ts` — typed runtime event models plus serializers that power the websocket bridge.
- `src/__tests__/agentEvents.test.ts` — Jest coverage for the event serialisation edge-cases.

## Build & Development

- `npm run build --workspace @asynkron/openagent-web-core` compiles TypeScript sources into `dist/`.
- Consumers import from `@asynkron/openagent-web-core` and rely on the compiled output.
- Jest tests import the TypeScript sources directly so they remain fast during development.
