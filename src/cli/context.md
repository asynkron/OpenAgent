# Directory Context: src/cli

## Purpose

- Provides terminal IO utilities used by the agent loop for user interaction and output rendering.

## Modules

- `runtime.js`: wires the agent runtime to the terminal renderer and exports `agentLoop` plus command tracking helpers used by the CLI entry point.
- `io.js`: readline wrapper with ESC detection (emits `ESCAPE_EVENT`, cancels active operations, highlights prompts).
- `render.js`: Markdown-based renderer for plans/messages/command summaries.
- `thinking.js`: spinner that displays elapsed time while awaiting API responses.
- `status.js`: prints transient status lines such as the remaining context window before issuing model requests.
- `runner.js`: parses CLI arguments, forwards template/shortcut subcommands, and launches the agent loop.

## Positive Signals

- Render helper offers rich summaries (e.g., read segments, stderr previews) that keep humans informed.
- ESC listener integrates with cancellation manager via `cancelActive('esc-key')`.

## Risks / Gaps

- Rendering assumes the assistant provides correctly fenced Markdown; malformed snippets may lead to plain-text output.
- Spinner writes directly to stdout; behaviour in non-TTY environments is only partially guarded.

## Related Context

- Consuming loop: [`../agent/context.md`](../agent/context.md)
- Cancellation utilities: [`../utils/context.md`](../utils/context.md)
