# Directory Context: src

## Purpose

- Primary ESM implementation of OpenAgent, replacing the legacy CommonJS tree.
- Contains agent runtime, CLI presentation, command runners, configuration, and supporting utilities.

## Structure

- `agent/`: conversation loop and OpenAI orchestration.
- `cli/`: readline, rendering, thinking indicator, CLI runner entrypoint.
- `lib/`: aggregated runtime exports consumed by both tests and the CLI wrapper.
- `commands/`: shell execution, read/edit/replace helpers, string quoting utilities.
- `config/`: system prompt discovery and workspace metadata.
- `openai/`: memoized OpenAI client factory.
- `shortcuts/`, `templates/`: CLI facades for auxiliary commands.
- `utils/`: cancellation manager, text helpers, output combiner.

## Positive Signals

- ESM modules with descriptive docblocks aid readability.
- Strong separation between loop orchestration and side-effecting helpers.
- Cancellation wiring (ESC + AbortController) aligns with research in `docs/openai-cancellation.md`.

## Risks / Gaps

- `agent/loop.js` is large (~800 lines) and mixes rendering, approval UI, and command execution—hard to test end-to-end.
- New built-ins (`quote_string`/`unquote_string`) lack dedicated unit coverage.
- Some command helpers (`runBrowse`) duplicate HTTP logic instead of reusing a single fetch pathway.

## Related Context

- Parent repo overview: [`../context.md`](../context.md)
- Child breakdowns:
  - [`agent/context.md`](agent/context.md)
  - [`cli/context.md`](cli/context.md)
  - [`commands/context.md`](commands/context.md)
  - [`config/context.md`](config/context.md)
  - [`openai/context.md`](openai/context.md)
  - [`shortcuts/context.md`](shortcuts/context.md)
  - [`templates/context.md`](templates/context.md)
  - [`utils/context.md`](utils/context.md)
