# Directory Context: src/cli

## Purpose

- Provides terminal IO utilities used by the agent loop for user interaction and output rendering.

## Modules

- `io.js`: readline wrapper with ESC detection (emits `ESCAPE_EVENT`, cancels active operations, highlights prompts).
- `render.js`: Markdown-based renderer for plans/messages/command summaries; heuristically detects languages for fenced code blocks.
- `thinking.js`: spinner that displays elapsed time while awaiting API responses.
- `status.js`: prints transient status lines such as the remaining context window before issuing model requests.

## Positive Signals

- Render helper offers rich summaries (e.g., read segments, stderr previews) that keep humans informed.
- ESC listener integrates with cancellation manager via `cancelActive('esc-key')`.

## Risks / Gaps

- `render.js` heuristics rely on regexes; language detection may drift from actual file types.
- Spinner writes directly to stdout; behaviour in non-TTY environments is only partially guarded.

## Related Context

- Consuming loop: [`../agent/context.md`](../agent/context.md)
- Cancellation utilities: [`../utils/context.md`](../utils/context.md)
