# Directory Context: legacy/src/openai

## Purpose
- CommonJS OpenAI client wrapper mirroring `src/openai/client.js`.

## Key Module
- `client.js`: memoizes the OpenAI SDK instance using environment variables; exports `MODEL`, `getOpenAIClient`, `resetOpenAIClient`.

## Positive Signals
- Behaviour parity with ESM code keeps legacy entry point stable.

## Risks / Gaps
- Requires manual updates if environment handling changes in the ESM build.

## Related Context
- ESM client: [`../../../src/openai/context.md`](../../../src/openai/context.md)
