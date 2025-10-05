# Directory Context: legacy/src

## Purpose
- CommonJS mirror of the modern `src/` tree, keeping API-compatible modules for consumers still expecting `require()`.

## Structure Overview
- `agent/`: CJS agent loop identical in logic to `src/agent/loop.js`.
- `cli/`: readline/render/thinking helpers with `module.exports`.
- `commands/`: shell/browse/edit/etc. runners using CommonJS.
- `config/`, `openai/`, `shortcuts/`, `templates/`, `utils/`: counterparts to the ESM directories.

## Positive Signals
- Direct copy of modern code ensures functionality parity when kept in sync.

## Risks / Gaps
- No automation guarantees the mirror stays current after edits to the ESM sources.
- Duplication inflates patch size for every change touching core modules.

## Related Context
- Parent legacy overview: [`../context.md`](../context.md)
- Modern equivalents: [`../../src/context.md`](../../src/context.md)
