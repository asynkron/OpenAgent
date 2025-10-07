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
- `ui/`: transport-agnostic UI bindings (e.g., WebSocket adapters) for the runtime.
- `utils/`: cancellation manager, text helpers, output combiner.

## Positive Signals

- ESM modules with descriptive docblocks aid readability.
- Strong separation between loop orchestration and side-effecting helpers.
- Cancellation wiring (ESC + AbortController) aligns with research in `docs/openai-cancellation.md`.
- ESC-triggered cancellation now has both integration and unit regression coverage, validating the shared cancellation stack.
- Prettier formatting is enforced across agent and CLI modules, keeping lint checks green in every workflow.

## Risks / Gaps

- Browse command coverage focuses on GET requests; non-GET scenarios still require manual validation.
- Integration suites rely on mocked command runners; real child-process cancellation still needs periodic manual validation.

## Related Context

- Parent repo overview: [`../context.md`](../context.md)
- Child breakdowns:
  - [`agent/context.md`](agent/context.md)
  - [`cli/context.md`](cli/context.md)
  - [`commands/context.md`](commands/context.md)
  - [`config/context.md`](config/context.md)
  - [`openai/context.md`](openai/context.md)
  - [`utils/context.md`](utils/context.md)
