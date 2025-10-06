# Directory Context: src/openai

## Purpose

- Wraps the OpenAI SDK with memoization so the agent shares a single client instance.

## Key Modules

- `client.js`: exports `getOpenAIClient()`, `resetOpenAIClient()`, and `MODEL` (reads `OPENAI_MODEL`/`OPENAI_CHAT_MODEL`, defaults to `gpt-5-codex`).
- `responses.js`: wraps `openai.responses.create` calls to add shared parameters (e.g., JSON response format, reasoning effort sourced from `OPENAI_REASONING_EFFORT`).

## Positive Signals

- Lazy instantiation delays API key requirement until first use, matching CLI expectations.
- Supports overriding base URL via `OPENAI_BASE_URL` for testing/self-hosting.

## Risks / Gaps

- No validation of model compatibility; if environment variables conflict, failures surface at runtime only.
- Memoized client lacks per-request timeout or retry settings—timeouts handled elsewhere.
- Invalid `OPENAI_REASONING_EFFORT` values currently only emit a runtime warning and fall back to no reasoning hint.

## Related Context

- Consumed by agent loop: [`../agent/context.md`](../agent/context.md)
- Tests referencing exports: [`../../tests/unit/index.test.js`](../../tests/unit/index.test.js)
