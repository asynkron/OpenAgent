# Core Unknown-Type Surfaces Audit

This note catalogs runtime code in `packages/core` that still exposes critical data as `Record<string, unknown>` (or similar "unknown" shims). Tightening these areas will help surface schema drift during compilation rather than at runtime.

## Command execution pipeline
- `agent/commandExecution.ts` models `AgentCommand`, `CommandExecutionResult`, and the injected shell runner as `Record<string, unknown>`, so command payloads and execution metadata remain unchecked even though the runtime expects concrete fields like `run`, `cwd`, and structured results. Typing the command DTO and shell result would let approvals, observation builders, and stats collectors rely on a shared schema.

## History & observation surfaces
- `agent/historyEntry.ts` defines the base `ChatMessageEntry`/`JsonLikeObject` types as arbitrary records and uses `@ts-nocheck`, leaving the chat transcript structure unvalidated while it flows into OpenAI requests.
- `agent/historyMessageBuilder.ts` and `agent/observationBuilder.ts` both export observation payloads as `Record<string, unknown>` derivatives under `@ts-nocheck`, even though they set/expect specific flags (`exit_code`, `truncated`, metadata blocks, etc.).
- `agent/amnesiaManager.ts` operates on history entries treated as loose records, so the redaction rules cast to `Record<string, unknown>` before mutating content.

## Approval & prompt gating
- `agent/approvalManager.ts` represents commands, configuration, and prompt metadata as `Record<string, unknown>`, meaning the auto-approval allowlist/session cache cannot rely on a stable command schema.
- `agent/runtimeTypes.ts` aliases `UnknownRecord = Record<string, unknown>` and propagates it through runtime events and the prompt coordinator contract, keeping factory consumers untyped even when the event payload shape is known.

## Pass executor event/debug payloads
- `agent/passExecutor/types.ts` exposes the debug emitter and runtime event hook as `Record<string, unknown>`, so downstream observers receive untyped data despite well-known fields like `stage` or plan snapshots.

Addressing these files alongside the previously flagged plan manager and prompt coordinator will significantly reduce the `unknown` surface in the core runtime and let `npm run typecheck` enforce our protocol contracts.
