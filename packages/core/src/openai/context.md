# Directory Context: src/openai

## Purpose & Scope

- Client wrappers and helpers for interacting with the OpenAI Responses API.

## Key Files

- `client.js` — lazily instantiates the OpenAI SDK client based on environment variables, validates models, surfaces setup guidance when configuration is missing, and exposes `MODEL`, `getOpenAIClient`, `resetOpenAIClient`.
- `responses.ts` — constructs structured responses API calls, attaches tool schemas, handles retries, and normalizes errors (now resolving both object- and function-shaped providers returned by the AI SDK) while exposing typed call options so downstream callers no longer rely on defensive runtime checks. Call settings now use a partial type so default retry/abort behavior compiles cleanly when no overrides are provided, and the helpers now delegate to focused functions for selecting language models, structuring tool calls, and text fallbacks. Structured stream callbacks now flow through the canonical `PlanResponse` contract (see `PlanResponseStreamPartial`) instead of the legacy `ToolResponse` alias, with explicit normalizers removing the need for wildcard/`any` casts.
  - Strict JSON Schema is always enabled for OpenAI providers (the client passes `providerOptions.openai.strictJsonSchema = true`).
- `responseUtils.js` — normalizes OpenAI Responses payloads, exposing helpers to pull the sanitized `open-agent` tool call (for protocol validation) while still providing a text fallback for legacy/plain-text replies.

## Positive Signals

- Client initialization performs configuration validation (model support, base URL sanity) before runtime usage.
- Unit tests simulate request/response flows, catching regressions in API contract parsing.
- Tool-aware extraction ensures agent parsing works even when models omit free-form text output, and the OpenAgent tool embeds a lazily-evaluated JSON Schema so the AI SDK can consume the contract without needing to introspect Zod internals; the new `ResponseCallOptions` contract eliminates ad-hoc `typeof` guards.
- `responses.js` only attaches the OpenAgent tool schema when callers explicitly request it, keeping summary calls lightweight while enforcing the shared contract during agent passes while remaining compatible with the latest Vercel AI provider facade.
- The OpenAI factory and response helpers now consume the AI SDK's provider types directly, surfacing integration issues during builds instead of at runtime.

## Risks / Gaps

- Reliance on OpenAI SDK version pinned in `package.json`; monitor for breaking API changes.
- Timeout/retry defaults derive from env vars—document expected overrides when embedding in long-running services.

## Related Context

- Agent runtime usage: [`../agent/context.md`](../agent/context.md).
- Library exports: [`../lib/context.md`](../lib/context.md).
