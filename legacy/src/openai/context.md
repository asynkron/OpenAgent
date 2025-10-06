# Directory Context: legacy/src/openai

## Purpose
- Archived OpenAI client wrapper mirroring `src/openai/client.js` prior to the pure-ESM transition.

## Key Module
- `client.js`: memoizes the OpenAI SDK instance using environment variables; exports `MODEL`, `getOpenAIClient`, `resetOpenAIClient`.

## Positive Signals
- Captures how the client was previously instantiated, useful when tracing historical bugs.

## Risks / Gaps
- Manual updates would be required to keep it aligned with the active ESM client; prefer the live code for authoritative behaviour.

## Related Context
- ESM client: [`../../../src/openai/context.md`](../../../src/openai/context.md)
