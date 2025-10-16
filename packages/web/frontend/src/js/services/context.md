# Directory Context: packages/web/frontend/src/js/services

## Purpose & Scope

- Houses the browser chat service orchestration and supporting modules for DOM control, socket lifecycle management, and payload normalisation.
- Keeps helpers free of direct UI mutations where possible so Jest suites can cover the pure logic without spinning up complex DOM fixtures.

## Key Modules

- `chat.ts` — top-level composition layer that wires DOM controller methods to typed socket/router/input helpers while tracking conversation state.
- `chat_domController.ts` — DOM mutation utilities responsible for rendering messages, plans, status banners, and thinking indicators.
- `chat_socket.ts` — WebSocket manager emitting typed lifecycle/status events, encapsulating reconnect timers, and guarding against stale sockets.
- `chat_router.ts` — Payload handler map converting agent payloads into normalised actions (`message`, `status`, `plan`, etc.) consumed by the DOM layer.
- `chat_inputController.ts` — Form/input coordinator managing auto-resize, submission shortcuts, and an outgoing message queue bound to an injected sender.

## Tests

- Jest suites under `__tests__/` cover chat model utilities plus the socket manager, router normalisation, and input controller queueing/retry behaviour using lightweight fakes.
