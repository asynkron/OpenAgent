# Directory Context: prompts

## Purpose

- Stores the canonical system/developer prompts that define agent behaviour.
- Provides editable copies used during prompt experiments (`developer copy.md`, `system copy.md`).

## Key Files

- `system.md`: top-level operating constraints (hierarchy, safety, refusal policy).
- `developer.md`: hands-on workflow instructions, built-in command documentation (now includes `quoteString` / `unquoteString`).
- `prompts.json`: manifest describing canonical prompts and the copies that must remain synchronized.
- `*_copy.md`: reference versions for experimentation; kept in lockstep with the canonical files via automation.

## Positive Signals

- Detailed procedural guidance reduces ambiguity about approvals, planning, and command execution.
- System prompt now instructs the agent to read `context.md` files in the top three directory levels on startup for fast situational awareness.
- Hidden directories remain off-limits by default, preventing accidental inspection of `.git`, `.idea`, etc.
- New `read` workflow instructions encourage the agent to list candidate files before bulk reads, limiting accidental large dumps.

## Risks / Gaps

- Keep the manifest entries in `prompts.json` aligned with any new prompts that are added.

## Related Context

- Root overview: [`../context.md`](../context.md)
- Command implementation details: [`../src/commands/context.md`](../src/commands/context.md)
