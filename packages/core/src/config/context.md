# Directory Context: src/config

## Purpose & Scope

- Builds and discovers system prompts consumed by the agent runtime and exported library.

## Key Files

- `systemPrompt.js` — loads prompt assets, embeds the canonical prompt strings generated at build time, resolves additional prompts on disk, and exposes helpers (`findAgentFiles`, `buildAgentsPrompt`, constants like `SYSTEM_PROMPT`).
- `generatedSystemPrompts.ts` — auto-generated during `npm run build` and exports the canonical prompt contents as immutable constants so published packages do not rely on runtime file reads.
- `__tests__/systemPrompt.test.ts` — guards against regressions by asserting that the base prompt always includes the canonical system and developer guidance from `packages/core/prompts`.

## Positive Signals

- Encapsulates prompt discovery logic so runtime code simply imports constants/functions.
- Tested via unit suites to guard against prompt file drift.

## Risks / Gaps

- File system discovery assumes repository layout; ensure paths remain valid when packaging or bundling.
- Updates to prompt schema must be reflected here and in `packages/core/prompts/` docs.

## Related Context

- Prompt content: [`../../prompts/context.md`](../../prompts/context.md).
- Library exports: [`../lib/context.md`](../lib/context.md).
