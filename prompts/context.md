# Directory Context: prompts

## Purpose

- Stores the canonical system/developer prompts that define agent behaviour.
- Provides editable copies used during prompt experiments (`developer copy.md`, `system copy.md`).

## Key Files

- `system.md`: top-level operating constraints (hierarchy, safety, refusal policy).
- `developer.md`: hands-on workflow instructions, built-in command documentation (now includes `quoteString` / `unquoteString`).
- `*_copy.md`: reference versions for experimentation; keep in sync manually.

## Positive Signals

- Detailed procedural guidance reduces ambiguity about approvals, planning, and command execution.
- System prompt now instructs the agent to read `context.md` files in the top three directory levels on startup for fast situational awareness.
- Hidden directories remain off-limits by default, preventing accidental inspection of `.git`, `.idea`, etc.
- New `read` workflow instructions encourage the agent to list candidate files before bulk reads, limiting accidental large dumps.

## Risks / Gaps

- Duplicate “copy” files can fall out of sync with the canonical prompts.
- No automation validates prompt JSON examples against actual schema.

## Related Context

- Root overview: [`../context.md`](../context.md)
- Command implementation details: [`../src/commands/context.md`](../src/commands/context.md)
