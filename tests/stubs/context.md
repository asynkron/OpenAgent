# Directory Context: tests/stubs

## Purpose & Scope

- Houses lightweight ESM shims that let Jest resolve external AI SDK imports during unit and integration tests.
- Keeps the repository testable in sandboxed environments where the real SDKs are unavailable.

## Key Files

- `ai.ts` — stub for the Vercel `ai` package; tests mock `generateText` / `generateObject` on top of this placeholder.
- `aiSdkOpenAI.ts` — stub for `@ai-sdk/openai`, returning a predictable object from `createOpenAI()` for memoization checks.
- `openai.ts` — placeholder for the official OpenAI SDK; instantiation throws so tests must mock it explicitly.

## Maintenance Notes

- These shims should remain minimal. If tests need additional surface area, extend the stubs together with accompanying assertions so unintended runtime usage fails fast.
