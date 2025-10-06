# Directory Context: legacy/src/agent

## Purpose
- Archived implementation of the agent loop retained for historical study now that the supported runtime is pure ESM.
- Documents `createAgentLoop` and related helpers as they appeared before the CommonJS compatibility layer was removed.

## Key Concepts
- `executeAgentPass` handles OpenAI call/observation cycle, approvals, and ESC cancellation.
- `extractResponseText`, `parseReadSpecTokens`, `mergeReadSpecs`: parsing helpers shared with the ESM version.

## Positive Signals
- Shows how cancellation and command stats behaved prior to the ESM-only refactor, useful when auditing regressions.

## Risks / Gaps
- Logic duplication means any bugfix in `src/agent/loop.js` would require manual backporting—avoid depending on this snapshot at runtime.
- Historic CommonJS patterns linger in comments; clarify in docs that they're no longer representative of the supported build.

## Related Context
- Modern agent loop: [`../../../src/agent/context.md`](../../../src/agent/context.md)
- Parent legacy sources: [`../context.md`](../context.md)
