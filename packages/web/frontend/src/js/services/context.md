# Directory Context: packages/web/frontend/src/js/services

## Purpose & Scope

- Houses the browser chat service orchestration and supporting modules for DOM control, socket lifecycle management, and payload normalisation.
- Keeps helpers free of direct UI mutations where possible so Jest suites can cover the pure logic without spinning up complex DOM fixtures.

## Key Modules

- `chat.ts` — top-level composition layer that wires DOM controller methods to typed socket/router/input helpers while tracking conversation state.
- `chat_domHelpers.ts` — Provides DOM listener helpers and textarea auto-resize logic with injectable scheduling/document dependencies; `chat_dom.ts` re-exports the defaults for compatibility with existing callers.
- `chat_domController.ts` — DOM mutation utilities responsible for rendering messages, plans, status banners, and thinking indicators; tracks runtime `__id` values to update existing rows in place and renders command metadata/output blocks using the CSS-driven layout.
- `chat_eventDisplay.ts` — Resolves banner/status headings and bodies using deterministic resolver functions so DOM renderers receive consistent copy without duplicating heuristics.
- `chat_eventDisplayHelpers.ts` — Shared normalisation helpers and resolver functions used by the event display module to keep per-file complexity low.
- `chat_socket.ts` — WebSocket manager emitting typed lifecycle/status events, encapsulating reconnect timers, and guarding against stale sockets; shared helpers now centralise URL resolution and teardown logging so the event handlers stay small.
- `chat_router.ts` — Payload handler map converting agent payloads into normalised actions (`message`, `status`, `plan`, etc.) consumed by the DOM layer, now forwarding runtime identifiers so the DOM can reconcile streaming updates without duplicating entries.
- `chat_inputController.ts` — Form/input coordinator managing auto-resize, submission shortcuts, and an outgoing message queue bound to an injected sender.
- `chat_model.ts` — Shared type definitions plus re-exports of the pure chat helper modules.
- `chat_modelText.ts` — Text and approval-detection utilities shared by the router and DOM controllers.
- `chat_modelPreview.ts` — Command preview normalisers used when rendering shell snippets.
- `code_highlighter.ts` — Applies highlight.js markup to rendered code blocks so markdown content and command previews share the
  same syntax highlighting pipeline.

## Tests

- Jest suites under `__tests__/` cover chat model utilities plus the socket manager, router normalisation, DOM helper scheduling/resize behaviours, and input controller queueing/retry behaviour using lightweight fakes.
