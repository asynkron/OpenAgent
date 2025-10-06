# Directory Context: legacy/src/utils

## Purpose
- Archived copies of utility helpers (cancellation manager, text helpers, output combiner) preserved from the pre-ESM era.

## Modules
- `cancellation.js`, `output.js`, `text.js`: mirror older logic for reference; the live implementations reside in `src/utils`.

## Positive Signals
- Provides historical context when comparing new utility behaviour against earlier revisions.

## Risks / Gaps
- Snapshot can drift or omit newly added helpers (e.g., escape string utilities); do not rely on it for runtime usage.

## Related Context
- Modern utilities: [`../../../src/utils/context.md`](../../../src/utils/context.md)
