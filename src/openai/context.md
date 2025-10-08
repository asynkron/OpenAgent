# Directory Context: src/openai

## Purpose & Scope

- Client wrappers and helpers for interacting with the OpenAI Responses API.

## Key Files

- `client.js` — lazily instantiates the OpenAI SDK client based on environment variables, validates models, and exposes `MODEL`, `getOpenAIClient`, `resetOpenAIClient`.
- `responses.js` — constructs structured responses API calls, attaches tool schemas, handles retries, and normalizes errors.
- `responseUtils.js` — extracts assistant tool arguments (preferring `function_call` arguments with text fallback) from Responses API payloads for downstream parsing.

## Positive Signals

- Client initialization performs configuration validation (model support, base URL sanity) before runtime usage.
- Unit tests simulate request/response flows, catching regressions in API contract parsing.
- Tool-aware extraction ensures agent parsing works even when models omit free-form text output.

## Risks / Gaps

- Reliance on OpenAI SDK version pinned in `package.json`; monitor for breaking API changes.
- Timeout/retry defaults derive from env vars—document expected overrides when embedding in long-running services.

## Related Context

- Agent runtime usage: [`../agent/context.md`](../agent/context.md).
- Library exports: [`../lib/context.md`](../lib/context.md).
