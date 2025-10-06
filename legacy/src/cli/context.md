# Directory Context: legacy/src/cli

## Purpose
- Archived copies of the CLI helpers (readline prompts, renderer, thinking animation) from the pre-ESM build.

## Modules
- `io.js`: readline wrapper with ESC support via event emitters.
- `render.js`: Markdown/terminal renderer using `marked-terminal` with command summary helpers.
- `thinking.js`: spinner with elapsed time display.

## Positive Signals
- Useful when tracing UI changes back through time without touching the active ESM helpers.

## Risks / Gaps
- Duplication invites drift; prefer editing the active ESM helpers and treat this directory as reference material only.

## Related Context
- ESM CLI helpers: [`../../../src/cli/context.md`](../../../src/cli/context.md)
