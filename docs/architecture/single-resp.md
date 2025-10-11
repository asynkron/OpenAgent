# Single-Responsibility Refactor Plan

## Overview
This document captures the phased plan to split prompt management, command execution, and transport adapters into dedicated modules. The goal is to reduce coupling in the OpenAgent runtime, improve testability, and enable pluggable transports.

## Target Architecture Layers

### Prompt Management
- Discovers prompt assets (system, developer, AGENTS.md) and keeps them in sync.
- Produces `PromptContext` structures combining system prompt, conversation history, plan summaries, and session flags.
- Mediates UI prompt requests via a `PromptIO` collaborator, buffering responses and handling cancellation.

### Command Execution
- Accepts normalized `CommandRequest` payloads and handles approval, shell invocation, telemetry, and plan updates.
- Produces structured `CommandResult` objects with observations consumable by the LLM loop.
- Delegates shell execution to a thin `CommandRunner` wrapper for mocking.

### Transport Adapters
- Wrap model provider APIs behind a `TransportAdapter` interface (`createSession`, `sendPrompt`, `streamResponses`, `close`).
- Translate provider-specific payloads into canonical `ResponseChunk` events for the agent loop.
- Provide hooks for telemetry and error handling without leaking provider internals.

## Shared Data Contracts
```ts
interface PromptContext {
  systemPrompt: string;
  planSummary?: string;
  recentMessages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  sessionFlags: Record<string, unknown>;
}

interface CommandRequest {
  key: string;
  run: string;
  shell?: string;
  cwd?: string;
  timeout_sec?: number;
  description?: string;
  approval?: 'auto' | 'session' | 'human';
  planStepId?: string;
}

interface CommandResult {
  status: 'completed' | 'failed' | 'canceled';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  observation: ObservationPayload;
  durationMs: number;
  planDelta?: PlanUpdate;
}

interface ResponseChunk {
  type: 'message' | 'tool-call' | 'tool-result' | 'status';
  payload: any;
}
```

## PromptManager Extraction Phases
1. **Scaffolding**: Create `packages/core/src/prompts/manager.js`, keep it internal (no public export yet), and seed initial tests.
2. **Asset Discovery Migration**: Move filesystem helpers from `config/systemPrompt.js` and integrate manifest validation.
3. **Prompt Request Handling**: Fold `PromptCoordinator` buffering/cancellation into the manager; expose `requestUserInput` API.
4. **Runtime Wiring**: Inject `PromptManager` into `createAgentRuntime`, approval manager, and WebSocket binding.
5. **Testing & Docs**: Update unit/integration tests and refresh context documentation.
6. **Cleanup**: Remove deprecated exports once all consumers migrate.

## CommandExecutor Extraction Phases
1. **Scaffolding**: Add `commands/executor.js` and fetch existing tests into executor-focused suites.
2. **Approval Flow Extraction**: Move approval checks into an `ApprovalGateway` collaborator injected into executor.
3. **Execution Pipeline**: Wrap `runCommand`, consolidate cancellation registration, and enforce timeouts centrally.
4. **Plan Synchronization**: Introduce `PlanSync` adapter for plan status/observation updates.
5. **Telemetry & Errors**: Emit structured status events and adopt standardized command errors.
6. **Testing & Cleanup**: Port tests, add new coverage, and strip redundant logic from `passExecutor.js`.

## Transport Adapter Rollout
1. **Scaffolding**: Create `packages/core/src/transports/` with shared types and mock adapter.
2. **OpenAI Adapter Extraction**: Move `openai/client.js` logic into `transports/openaiAdapter.js` and align response parsing.
3. **Runtime Integration**: Update `createAgentRuntime` and `agent/loop.js` to use adapter factory instead of direct OpenAI client access.
4. **Mock/Test Adapter**: Provide deterministic adapter for tests and ensure runtime swapping works.
5. **Telemetry**: Standardize logging hooks (`request`, `response`, `retry`, `error`) and expose token usage metrics.
6. **Cleanup**: Deprecate `getOpenAIClient` exports once CLI migrates; refresh docs.

## Follow-Up Items
- Decide on streaming semantics and buffering for tool calls within transport adapters.
- Define contract for command retries between CommandExecutor and the agent loop.
- Document dry-run capabilities for plan previews if added later.
