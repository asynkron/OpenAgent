# Directory Context: legacy/src/utils

## Purpose
- CommonJS versions of utility helpers (cancellation manager, text helpers, output combiner).

## Modules
- `cancellation.js`, `output.js`, `text.js`: match ESM logic but export via `module.exports`.

## Positive Signals
- Offers drop-in compatibility for legacy entry point without re-implementing logic.

## Risks / Gaps
- Mirror can drift if new utilities (e.g., escape string helpers) are added only to ESM branch.

## Related Context
- Modern utilities: [`../../../src/utils/context.md`](../../../src/utils/context.md)
