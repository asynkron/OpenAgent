# Directory Context: legacy

## Purpose
- Preserves the pre-ESM CommonJS implementation of OpenAgent for reference or fallback usage.
- Mirrors the modern `src/` tree with `.cjs` exports for environments that still rely on `require()`.

## Key Files
- `index.cjs`: CommonJS entry point matching `index.js` behaviour (auto-approve flags, template/shortcut dispatch).
- `package.json`: minimal metadata for the legacy build.
- `src/` (see child contexts) duplicates agent loop, CLI, commands, etc., in CommonJS form.

## Positive Signals
- Provides a stable rollback target during ongoing ESM migration work referenced in `docs/modernization-plan.md`.

## Risks / Gaps
- High maintenance cost: files can silently drift from the ESM equivalents without automated sync.
- No dedicated tests ensure parity between `legacy/src` and `src` directories.

## Related Context
- Modern ESM sources: [`../src/context.md`](../src/context.md)
- Child breakdowns:
  - [`src/context.md`](src/context.md)
