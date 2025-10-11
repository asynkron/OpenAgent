# Directory Context: src/openai

## Purpose & Scope

- Client wrappers and helpers for interacting with the OpenAI Responses API.

## Key Files

- `client.js` — lazily instantiates the OpenAI SDK client based on environment variables, validates models, and exposes `MODEL`, `getOpenAIClient`, `resetOpenAIClient`.
- `responses.js` — constructs structured responses API calls, attaches tool schemas, handles retries, and normalizes errors.
- `responseUtils.js` — normalizes OpenAI Responses payloads, exposing helpers to pull the sanitized `open-agent` tool call (for protocol validation) while still providing a text fallback for legacy/plain-text replies.

## Positive Signals

- Client initialization performs configuration validation (model support, base URL sanity) before runtime usage.
- Unit tests simulate request/response flows, catching regressions in API contract parsing.
- Tool-aware extraction ensures agent parsing works even when models omit free-form text output.
- `responses.js` only attaches the OpenAgent tool schema when callers explicitly request it, keeping summary calls lightweight while enforcing the shared contract during agent passes.

## Risks / Gaps

- Reliance on OpenAI SDK version pinned in `package.json`; monitor for breaking API changes.
- Timeout/retry defaults derive from env vars—document expected overrides when embedding in long-running services.

## Related Context

- Agent runtime usage: [`../agent/context.md`](../agent/context.md).
- Library exports: [`../lib/context.md`](../lib/context.md).
