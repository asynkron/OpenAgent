# Directory Context: packages/core/prompts

## Purpose & Scope

- Authoritative prompt templates that define how the agent and human operators interact. These drive the JSON protocol enforced across the runtime and tests.

## Key Files

- `system.md` — canonical system prompt dictating response envelope rules, planning constraints, and instruction hierarchy.
- `developer.md` — extended guidance for tool usage, command schema examples, safety reminders, and now hands-on instructions
  for launching virtual sub-agents via the `virtual-agent` command prefix.
- `hotcode.md` — quick-start instructions for AI agents modifying code (e.g., run tests, follow context docs).
- `javascript.md` & `typescript.md` — language-specific guardrails for modifying OpenAgent’s JS/TS sources, including static analysis tips (FTA, ts-morph guidance for TypeScript).
- `prompts.json` — machine-readable bundle aligning with `schemas/prompts.schema.json`; consumed by `findAgentFiles` and prompt loaders.

## Positive Signals

- Prompts emphasize reading `context.md` files first, matching the repository’s AI-focused workflows.
- JSON bundle plus schema makes prompts testable and automatable.

## Risks / Gaps

- Prompt drift can break response validation; update `schemas/` and tests alongside any prompt edits.
- Text prompts are verbose; ensure CLI output remains readable when modifying sections.

## Related Context

- Schema enforcement: [`../../schemas/context.md`](../../schemas/context.md).
- Prompt discovery utilities: [`../src/config/context.md`](../src/config/context.md).
