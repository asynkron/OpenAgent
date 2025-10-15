# Directory Context: packages/cli/src/components/command

## Purpose & Scope

- Houses focused helpers that support the `Command` Ink component without crowding the main TSX file.
- Exposes reusable building blocks for plan headings, run previews, theme cloning, and summary line rendering.

## Key Modules

- `theme.ts` — clones the theme-driven styling props for commands so renders can safely mutate local copies.
- `planHeading.ts` — normalises the originating plan step into a short heading used inside the command chrome.
- `runPreview.tsx` — parses run text, extracts diff segments, and renders either inline or block markdown previews.
- `SummaryLine.tsx` — renders textual summary rows with theme-aware styling.

## Notes

- Modules export pure helpers to keep `Command.tsx` focused on layout and data orchestration.
- Shared utilities accept already computed props so tests can inject alternative styles when needed.
