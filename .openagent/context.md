# Directory Context: .openagent

## Purpose & Scope

- Runtime scratch space persisted by the agent loop. Historically stored transient `temp/` notes and `plan.json` snapshots; all
  scratch data is now ignored by Git so the directory stays clean in commits.

## Key Artifacts

- `plan.json` — JSON array representing the merged/active plan (`src/agent/loop.js` manages it). Reused between sessions when plan merging is enabled and now gitignored so release automation never sees a dirty tree.

## Positive Signals

- Persists plan progress so CLI restarts can resume context without re-querying the model.

## Risks / Gaps

- Files are not auto-cleaned; stale plans can confuse users/tests. Delete the directory when starting unrelated tasks.
- Directory is committed to `.gitignore`, but tests manipulating plan state must manage their own cleanup.

## Related Context

- Plan management implementation: [`../packages/core/src/agent/context.md`](../packages/core/src/agent/context.md).
- CLI runtime surface: [`../packages/cli/src/context.md`](../packages/cli/src/context.md).
