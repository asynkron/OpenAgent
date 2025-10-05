# Directory Context: legacy/src/agent

## Purpose
- CommonJS implementation of the agent loop for backward compatibility.
- Exposes `createAgentLoop` and helper utilities via `module.exports` mirroring `src/agent/loop.js`.

## Key Concepts
- `executeAgentPass` handles OpenAI call/observation cycle, approvals, and ESC cancellation.
- `extractResponseText`, `parseReadSpecTokens`, `mergeReadSpecs`: parsing helpers shared with the ESM version.

## Positive Signals
- Maintains identical behaviour to the ESM agent, including cancellation and command stats.

## Risks / Gaps
- Logic duplication means any bugfix in `src/agent/loop.js` must be manually ported.
- CommonJS modules make tree-shaking or modern bundling harder.

## Related Context
- Modern agent loop: [`../../../src/agent/context.md`](../../../src/agent/context.md)
- Parent legacy sources: [`../context.md`](../context.md)
