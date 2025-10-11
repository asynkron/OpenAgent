# Directory Context: src/services

## Purpose & Scope

- Shared stateful services supporting the agent runtime, primarily around command approval tracking and statistics.

## Key Files

- `commandApprovalService.js` — manages pre-approved command allowlist loading, session-level approvals, and helper functions (`isPreapprovedCommand`, `sessionApprovalService`).
- `commandStatsService.js` — accumulates command execution metrics (counts, durations) and exposes reset helpers.

## Positive Signals

- Approval service decouples policy from runtime UI, simplifying reuse in tests and potential non-CLI front-ends.
- Unit tests cover allowlist parsing and approval flows.

## Risks / Gaps

- Allowlist configuration lives in `approved_commands.json`; ensure updates keep service expectations (schema) aligned.
- Command stats service currently only used for telemetry; consider persisting metrics if long-term analysis is desired.

## Related Context

- Runtime consumers: [`../agent/context.md`](../agent/context.md).
- Tests covering services: [`../../tests/unit/context.md`](../../tests/unit/context.md).
