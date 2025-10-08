# Directory Context: src/bindings

## Purpose & Scope
- Adapters that expose the agent runtime over alternative transports. Currently implements a WebSocket binding.

## Key Files
- `websocket.js` — wraps `createAgentRuntime`, parses incoming socket messages (string/binary), forwards prompts/cancel events, and streams runtime events back over the socket.

## Positive Signals
- Provides thorough normalization utilities (binary decoding, payload wrapping) making the binding resilient to different socket libraries.
- Includes unit tests (`tests/unit/websocketBinding.test.js`) covering parsing, event wiring, and cancellation.

## Risks / Gaps
- Only supports simple send/receive semantics; advanced features (backpressure, auth) must be layered externally.
- Error handling logs to console; consider injectable loggers for production services.

## Related Context
- Runtime core consumed here: [`../agent/context.md`](../agent/context.md).
- CLI counterpart: [`../cli/context.md`](../cli/context.md).
