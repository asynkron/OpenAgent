# Directory Context: legacy/src

## Purpose
- Archival snapshot of the pre-ESM tree, preserved for historical comparison rather than active CommonJS distribution.

## Structure Overview
- `agent/`: Historical copy of the agent loop as it existed before the pure-ESM cutover.
- `cli/`: Archived readline/render/thinking helpers that match the older layout.
- `commands/`: Shell/browse/edit/etc. runners retained for comparison with the active ESM implementations.
- `config/`, `openai/`, `shortcuts/`, `templates/`, `utils/`: counterparts kept solely to show past structure.

## Positive Signals
- Captures the previous module organisation for teams that need to audit historical behaviour.

## Risks / Gaps
- Not exercised or synced with the active code; treat as read-only documentation.
- Duplication can confuse newcomers—call out in documentation that CommonJS compatibility has been retired.

## Related Context
- Parent legacy overview: [`../context.md`](../context.md)
- Modern equivalents: [`../../src/context.md`](../../src/context.md)
