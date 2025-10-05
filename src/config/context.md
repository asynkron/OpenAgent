# Directory Context: src/config

## Purpose
- Builds the system prompt by aggregating core prompts and local `AGENTS.md` files, and exposes workspace metadata.

## Key Module
- `systemPrompt.js`: detects workspace root (prefers git), loads developer/system prompts, appends `brain/*.md`, and stitches local agent rules into the final `SYSTEM_PROMPT` string.

## Positive Signals
- Encapsulates prompt discovery, keeping `src/agent/loop.js` focused on runtime logic.
- Adds workspace metadata (root + detection source), improving observability for downstream tooling.

## Risks / Gaps
- `execSync('git rev-parse')` runs on startup and may throw in non-git environments despite try/catch handling.
- No caching when prompts are large; repeated reads could be expensive if we rebuild frequently.

## Related Context
- Prompts directory: [`../../prompts/context.md`](../../prompts/context.md)
- Agent loop consumer: [`../agent/context.md`](../agent/context.md)
