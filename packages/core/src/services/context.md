# Directory Context: src/services

## Purpose & Scope

- Shared stateful services supporting the agent runtime, primarily around command approval tracking and statistics.

## Key Files

- `commandApprovalService.ts` — orchestrates allowlist loading, signature tracking, and preapproval checks via helpers in `commandApproval/`.
- `commandApproval/` — focused modules for configuration loading, command-string safety validation, allowlist lookups, and command-specific rules.
- `commandStatsService.ts` — accumulates command execution metrics (counts, durations) and exposes reset helpers.

## Positive Signals

- Approval service decouples policy from runtime UI, simplifying reuse in tests and potential non-CLI front-ends (exercised via `../agent/__tests__/approvalManager.test.ts`).
- Helper modules clarify responsibility boundaries (file I/O, string safety, allowlist matching) making future rule tweaks easier to unit test.

## Risks / Gaps

- Allowlist configuration lives in `approved_commands.json`; ensure updates keep service expectations (schema) aligned.
- Command stats service currently only used for telemetry; consider persisting metrics if long-term analysis is desired.

## Related Context

- Runtime consumers: [`../agent/context.md`](../agent/context.md).
- Tests covering services: [`../agent/__tests__/approvalManager.test.ts`](../agent/__tests__/approvalManager.test.ts).
