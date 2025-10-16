# FTA Hotspots (2025-10-13)

## Overview

The `npm run fta` static analysis highlights TypeScript hotspots based on Flow Type Analysis (FTA) scores, where higher values indicate more complex or weakly typed surfaces. The 2025-10-13 run surfaces the following top priorities.

## Top Files to Improve

### 1. `packages/core/src/agent/passExecutor.ts` — FTA Score 82.02

_Why it matters_: `passExecutor` coordinates multi-pass reasoning: it invokes the OpenAI Responses API, reconciles plan updates, executes shell commands, and records observations. Its 749 lines now blend orchestration logic with dependency injection glue, making type relationships harder to follow.

_Opportunities_

- Split the orchestration phases (request preparation, response normalization, side-effect application) into smaller helpers housed under `passExecutor/` to shrink the main control-flow surface.
- Strengthen discriminated unions for response variants (plan adjustments vs. command execution vs. clarifying questions) so the executor no longer relies on repeated optional chaining.
- Introduce focused unit tests for the new helpers to keep regression coverage local while reducing the current mega-test burden in `__tests__/passExecutor.test.ts`.

### 2. `web/frontend/src/js/services/chat.ts` — FTA Score 81.23

_Why it matters_: The web chat service brokers real-time updates between the browser UI and the agent backend. At 692 lines, it mixes socket lifecycle management, optimistic updates, and plan rendering transforms, which dilutes cohesion.

_Opportunities_

- Extract socket event mapping (connect/disconnect/message) into a dedicated transport adapter so state reducers can focus on UI updates.
- Convert the mutable state buckets into typed reducers (or Zustand/Redux slices) to clarify which mutations are safe per event.
- Add integration tests that simulate websocket payloads to lock in the refactor and guard against regressions during reconnection edge cases.

## Next Steps

- Prioritize a pass on `passExecutor.ts`, coordinating with CLI consumers to ensure any event shape changes propagate smoothly.
- Schedule a follow-up on `chat.ts` to align frontend transport layering with the CLI/WebSocket contract, ideally after the backend socket adapter stabilizes.

---

For maintenance processes and repo-wide upkeep, see [docs/maintenance.md](./maintenance.md).
