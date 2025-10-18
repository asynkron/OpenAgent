# Directory Context: contracts

## Purpose & Scope

- Central location for runtime contracts shared across packages.
- Hosts explicit TypeScript interfaces for agent commands, plan steps, plan observations, and status enums.

## Key Files

- `command.ts` — defines `CommandDraft`, `CommandDefinition`, and `CommandExecutionDetails`.
- `planStatus.ts` — enumerates allowed plan statuses via the `PlanStatus` enum.
- `plan.ts` — models plan steps, plans, and observation payloads.
- `history.ts` — provides chat history payload contracts (entries, payload parts) used when projecting runtime history into model messages.
- `commandSchema.ts`, `planSchemas.ts`, `planJsonSchema.ts`, `modelResponseTypes.ts`, and `modelRequestBridge.ts` — implementation modules that host Zod schemas, JSON Schema exports, response DTO helpers, and lazy runtime bridges used by the barrel.
- `index.ts` — re-exports the canonical contracts plus the helper schemas/bridges in a single import surface.

## Maintenance Notes

- Update these interfaces first when adjusting the runtime payloads; downstream packages import from here.
- Keep property names aligned with the JSON protocol (snake_case for command payloads).
- When introducing new plan metadata fields, document them in `plan.ts` so validation schemas stay accurate.
- Legacy `Tool*` alias exports have been removed; import the canonical contract names (e.g., `PlanResponse`, `PlanStep`, `CommandDefinition`) directly from this module.
- The model request builder is exported solely as `buildOpenAgentRequestPayload`; consumers should import it by that name instead of relying on renamed shims.
- Schema implementations now live beside the contracts (see the files above); import them via `contracts/index.ts` rather than reaching into the implementation modules directly so the barrel can evolve without breaking consumers.
