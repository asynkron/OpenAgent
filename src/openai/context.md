# Directory Context: src/openai

## Purpose

- Wraps the OpenAI SDK with memoization so the agent shares a single client instance.

## Key Modules

- `client.js`: exports `getOpenAIClient()`, `resetOpenAIClient()`, and `MODEL` while validating configuration, enforcing responses-compatible models, and wiring timeout/retry defaults.
- `responses.js`: wraps `openai.responses.create` calls to add shared parameters (e.g., JSON response format, reasoning effort sourced from `OPENAI_REASONING_EFFORT`).

## Positive Signals

- Lazy instantiation delays API key requirement until first use, matching CLI expectations.
- Supports overriding base URL via `OPENAI_BASE_URL` for testing/self-hosting.
- Configuration validation now blocks legacy Chat Completion models and malformed base URLs before issuing requests.

## Risks / Gaps

- No validation of model compatibility; if environment variables conflict, failures surface at runtime only.
- Memoized client now supports environment-configured request timeout and retry counts.

## Configuration Notes

- `OPENAI_MODEL` should point at a Responses-compatible deployment. Setting both `OPENAI_MODEL` and `OPENAI_CHAT_MODEL` to different values throws during startup.
- `OPENAI_BASE_URL` must reference the API root (e.g., `https://api.openai.com/v1`). The validator rejects URLs that end with `/completions` paths.
- Optional safeguards include `OPENAI_TIMEOUT_MS` (positive integer, milliseconds) and `OPENAI_MAX_RETRIES` (non-negative integer).
- Invalid `OPENAI_REASONING_EFFORT` values currently only emit a runtime warning and fall back to no reasoning hint.

## Related Context

- Consumed by agent loop: [`../agent/context.md`](../agent/context.md)
- Tests referencing exports: [`../../tests/unit/index.test.js`](../../tests/unit/index.test.js)
