# Directory Context: src/agent

## Purpose

- Houses the conversational control loop that coordinates OpenAI calls, human approvals, and command execution.

## Key Module

- `loop.js`: exports `createAgentLoop` and `extractResponseText`.
  - `executeAgentPass(...)`: core pass that sends history to OpenAI, handles ESC cancellation via `AbortController`, renders output, and dispatches built-ins (`read`, `edit`, `replace`, `browse`, `escape_string`, `unescape_string`).
  - Approval flow integrates allowlist/session auto-approval and interactive prompts.
  - Applies output filtering/tailing before writing observations back to the model.

## Positive Signals

- Integrates cancellation research (AbortSignal + manual race) to respect ESC input.
- Rich logging/render hooks injected via dependency bag for easier testing/mocking.
- Maintains conversation history explicitly, facilitating reproducibility.

## Risks / Gaps

- Single file mixes parsing, approval UX, execution, and observation concerns—difficult to unit test in isolation.
- Built-in support for `escape_string`/`unescape_string` lacks matching verification in `tests/unit`.
- Manual JSON parsing of model output: failures simply push an observation, but no retries/backoff beyond loop re-entry.

## Supporting Utilities

- [`./openaiRequest.js`](./openaiRequest.js): wraps the OpenAI request lifecycle, ESC cancellation, and observation wiring.
- [`./commandApproval.js`](./commandApproval.js): centralises allowlist/session auto-approval and human prompt flow.
- [`./commandExecution.js`](./commandExecution.js): dispatches built-in helpers (`read`, `edit`, `replace`, `browse`, `escape_string`, `unescape_string`) and generic shell runs.
- [`./escState.js`](./escState.js): creates and resets ESC waiters shared across the loop helpers.
- [`../commands/readSpec.js`](../commands/readSpec.js): parses and merges `read` command specs invoked by the loop.
- [`../utils/plan.js`](../utils/plan.js): determines whether plan steps remain open before prompting the model.
- [`../utils/output.js`](../utils/output.js): now hosts preview generation used when rendering command results.

## Related Context

- CLI rendering invoked from here: [`../cli/context.md`](../cli/context.md)
- Command runners used for execution: [`../commands/context.md`](../commands/context.md)
- Approval rules source: [`../commands/context.md`](../commands/context.md)
- Tests exercising the loop: [`../../tests/integration/context.md`](../../tests/integration/context.md)
