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

## Risks / Gaps
- Duplicate “copy” files can fall out of sync with the canonical prompts.
- No automation validates prompt JSON examples against actual schema.

## Related Context
- Root overview: [`../context.md`](../context.md)
- Command implementation details: [`../src/commands/context.md`](../src/commands/context.md)
