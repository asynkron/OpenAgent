# Directory Context: legacy

## Purpose
- Archives the pre-ESM implementation of OpenAgent for historical reference only—this is no longer an actively supported CommonJS build.
- Mirrors the modern `src/` tree to document how APIs evolved, even though the modules now live exclusively in ESM form.

## Key Files
- `index.js`: frozen entry point that captures the historical surface without promising ongoing compatibility.
- `package.json`: minimal metadata so tests can still import the snapshot when auditing history.
- `src/` (see child contexts) duplicates agent loop, CLI, commands, etc., in archival form.

## Positive Signals
- Offers a reference when auditing older automation or documentation that still mentions the CommonJS build.

## Risks / Gaps
- Without clear messaging contributors might assume CommonJS compatibility still exists; cross-link modern docs to avoid confusion.
- The snapshot is not exercised by runtime tests, so it can drift—treat it as historical context only.

## Related Context
- Modern ESM sources: [`../src/context.md`](../src/context.md)
- Child breakdowns:
  - [`src/context.md`](src/context.md)
