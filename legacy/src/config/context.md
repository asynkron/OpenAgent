# Directory Context: legacy/src/config

## Purpose
- Maintains CommonJS version of system prompt assembly utilities.

## Key Module
- `systemPrompt.js`: discovers `AGENTS.md`, concatenates developer/system prompts, mirrors logic from ESM `src/config/systemPrompt.js`.

## Positive Signals
- Enables the legacy build to honour the same prompt composition rules as the modern entry point.

## Risks / Gaps
- Manual sync required with ESM prompt builder; divergences can change runtime behaviour unexpectedly.

## Related Context
- ESM configuration: [`../../../src/config/context.md`](../../../src/config/context.md)
