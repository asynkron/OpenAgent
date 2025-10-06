# Directory Context: legacy/src/config

## Purpose
- Archives the pre-ESM version of the system prompt assembly utilities for reference only.

## Key Module
- `systemPrompt.js`: discovers `AGENTS.md`, concatenates developer/system prompts, mirrors logic from ESM `src/config/systemPrompt.js`.

## Positive Signals
- Records how prompt composition used to work, which helps when tracing historical behavioural changes.

## Risks / Gaps
- Manual sync would be required to keep parity; prefer reading the active ESM module for real behaviour.

## Related Context
- ESM configuration: [`../../../src/config/context.md`](../../../src/config/context.md)
