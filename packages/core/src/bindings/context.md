# Directory Context: src/bindings

## Purpose & Scope

- Adapters that expose the agent runtime over alternative transports. Currently implements a WebSocket binding.

## Key Files

- `websocket.ts` — strongly typed WebSocket adapter that wraps `createAgentRuntime`, normalizes incoming payloads (string/binary) into typed prompt/cancellation envelopes, streams runtime events back over the socket, and forwards iterator completion so runtime queues clean up when sockets disconnect early.
  Parsing helpers now live beside the binding (`websocket/messageUtils.ts`, `websocket/guards.ts`) so the main module focuses on lifecycle wiring.

## Positive Signals

- Provides thorough normalization utilities (binary decoding, payload wrapping) making the binding resilient to different socket libraries.
- Includes unit tests (`__tests__/websocketBinding.test.js`) covering parsing, event wiring, and cancellation.

## Risks / Gaps

- Only supports simple send/receive semantics; advanced features (backpressure, auth) must be layered externally.
- Error handling logs to console; consider injectable loggers for production services.

## Related Context

- Runtime core consumed here: [`../agent/context.md`](../agent/context.md).
- CLI counterpart: [`../cli/context.md`](../cli/context.md).
