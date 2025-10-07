# Directory Context: src/services

## Purpose

- Hosts cross-cutting services that support command execution without living inside `src/commands/`.
- Provides reusable plumbing for command approvals and telemetry that the agent runtime, CLI, and library exports can consume.

## Notable Modules

- `commandApprovalService.js`: Session-aware allowlist enforcement and heuristics for auto-approving safe commands.
- `commandStatsService.js`: Atomically records command invocation counts to an XDG-compliant location for telemetry.

## Positive Signals

- Centralising approvals/telemetry keeps `src/commands/` focused on concrete built-ins.
- Services expose both class-based and function exports, easing migration for legacy imports.

## Risks / Gaps

- Approval heuristics remain regex heavy; broaden fixture coverage as new command patterns surface.
- Command stats writer lacks rotation; monitor file growth for long-lived deployments.

## Related Context

- Command primitives: [`../commands/context.md`](../commands/context.md)
- Runtime consumers: [`../agent/context.md`](../agent/context.md), [`../cli/context.md`](../cli/context.md)
