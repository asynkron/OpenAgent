# Directory Context: contracts

## Purpose & Scope

- Central location for runtime contracts shared across packages.
- Hosts explicit TypeScript interfaces for agent commands, plan steps, plan observations, and status enums.

## Key Files

- `command.ts` — defines `CommandDraft`, `CommandDefinition`, and `CommandExecutionDetails`.
- `planStatus.ts` — enumerates allowed plan statuses via the `PlanStatus` enum.
- `plan.ts` — models plan steps, plans, and observation payloads.
- `history.ts` — provides chat history payload contracts (entries, payload parts) used when projecting runtime history into model messages.
- `index.ts` — re-exports the individual contracts for convenient imports.

## Maintenance Notes

- Update these interfaces first when adjusting the runtime payloads; downstream packages import from here.
- Keep property names aligned with the JSON protocol (snake_case for command payloads).
- When introducing new plan metadata fields, document them in `plan.ts` so validation schemas stay accurate.
- Legacy `Tool*` alias exports have been removed; import the canonical contract names (e.g., `PlanResponse`, `PlanStep`, `CommandDefinition`) directly from this module.
