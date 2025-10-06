# Directory Context: src/utils

## Purpose

- Shared utility helpers for cancellation coordination, text manipulation, and stdout/stderr formatting.

## Modules

- `cancellation.js`: stack-based cancellation manager enabling ESC-triggered aborts and nested operations.
- `output.js`: merges stdout/stderr and provides preview builders used when rendering command results.
- `plan.js`: supplies plan inspection helpers (e.g., `planHasOpenSteps`).
- `text.js`: regex filtering, tailing, truncation, and lightweight shell argument splitting.
- `contextUsage.js`: estimates token usage/remaining context for the current conversation history.
- `jsonAssetValidator.js`: shared helpers for JSON schema validation and prompt copy synchronization checks.
- `fetch.js`: HttpClient abstraction unifying global fetch and Node http/https fallbacks with shared timeout handling.

## Positive Signals

- Cancellation manager abstracts lifecycle management away from commands, simplifying integration.
- `shellSplit` is reused by preapproval logic and tests, keeping parsing consistent.

## Risks / Gaps

- No persistence of cancellation state across process boundaries; relies on cooperative modules.
- `tailLines` and `applyFilter` operate naïvely on strings—no streaming support for large outputs.

## Related Context

- Consumers: [`../agent/context.md`](../agent/context.md), [`../commands/context.md`](../commands/context.md)
