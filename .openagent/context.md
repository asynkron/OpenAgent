# Directory Context: .openagent

## Purpose & Scope
- Runtime scratch space persisted by the agent loop. Currently stores `plan.json`, the last known execution plan emitted by the LLM.

## Key Artifacts
- `plan.json` — JSON array representing the merged/active plan (`src/agent/loop.js` manages it). Reused between sessions when plan merging is enabled.

## Positive Signals
- Persists plan progress so CLI restarts can resume context without re-querying the model.

## Risks / Gaps
- Files are not auto-cleaned; stale plans can confuse users/tests. Delete the directory when starting unrelated tasks.
- Directory is committed to `.gitignore`, but tests manipulating plan state must manage their own cleanup.

## Related Context
- Plan management implementation: [`../src/agent/context.md`](../src/agent/context.md).
- CLI runtime surface: [`../src/cli/context.md`](../src/cli/context.md).
