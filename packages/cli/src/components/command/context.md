# Directory Context: packages/cli/src/components/command

## Purpose & Scope

- Houses focused helpers that support the `Command` Ink component without crowding the main TSX file.
- Exposes reusable building blocks for plan headings, run previews, theme cloning, summary generation, and command metadata normalisation.

## Key Modules

- `theme.ts` — clones the theme-driven styling props for commands so renders can safely mutate local copies.
- `planHeading.ts` — normalises the originating plan step into a short heading used inside the command chrome.
- `runPreview.tsx` — parses run text, extracts diff segments, and renders either inline or block markdown previews.
- `SummaryLine.tsx` — renders textual summary rows with theme-aware styling.
- `commandTypes.ts` — defines the command payload, execution envelope, and summary line contracts used across the helpers.
- `previewLines.ts` — trims stdout/stderr previews into ready-to-render line arrays reused by both Ink and legacy console renderers.
- `renderType.ts`, `detailText.ts` — infer the display type for a command and expand execution metadata into human-readable headings.
- `descriptions.ts`, `summaryLines.ts`, `renderData.ts` — compute command descriptions, build compact stdout/stderr summaries, and assemble the aggregate render payload consumed by `commandUtils.ts` and the console renderer.

## Notes

- Modules export pure helpers to keep `Command.tsx` focused on layout and data orchestration.
- Shared utilities accept already computed props so tests can inject alternative styles when needed.
