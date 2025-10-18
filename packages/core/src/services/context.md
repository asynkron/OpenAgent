# Directory Context: src/services

## Purpose & Scope

- Shared stateful services supporting the agent runtime, primarily around command approval tracking and statistics.

## Key Files

- `commandApprovalService.ts` — orchestrates allowlist loading, session-level approvals, and re-exports the plain helpers (`isPreapprovedCommand`, `commandSignature`, `isCommandStringSafe`).
- `commandApprovalParser.ts` — parses candidate commands (`isCommandStringSafe`, tokenization, shell validation) before allowlist checks.
- `commandApprovalAllowlist.ts` — isolates allowlist lookups and subcommand gating so policy logic stays declarative.
- `commandApprovalCommandRules.ts` — houses per-command argument guards to keep high-risk tools constrained.
- `commandApprovalTypes.ts` — shared TypeScript contracts for command approvals, ensuring loaders and guards agree on structure.
- `commandStatsService.ts` — accumulates command execution metrics (counts, durations) and exposes reset helpers.

## Positive Signals

- Approval service decouples policy from runtime UI, simplifying reuse in tests and potential non-CLI front-ends (exercised via
  `../agent/__tests__/approvalManager.test.js`).
- Unit tests cover allowlist parsing and approval flows alongside the agent orchestration specs.

## Risks / Gaps

- Allowlist configuration lives in `approved_commands.json`; ensure updates keep service expectations (schema) aligned.
- Command stats service currently only used for telemetry; consider persisting metrics if long-term analysis is desired.

## Related Context

- Runtime consumers: [`../agent/context.md`](../agent/context.md).
- Tests covering services: [`../agent/__tests__/approvalManager.test.js`](../agent/__tests__/approvalManager.test.js).
