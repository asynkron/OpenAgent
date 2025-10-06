# OpenAgent Codebase Context

## Purpose & Scope
- Node.js CLI agent that converses with an LLM using a strict JSON protocol, renders assistant plans/messages, and executes shell commands under human approval.
- Codebase lives under `src/` (ESM). CommonJS support has been removed as of v2.0.

## Quick Directory Map
- Core runtime: [`src/context.md`](src/context.md)
- Tests: [`tests/context.md`](tests/context.md)
- Prompt/brain guidance: [`prompts/context.md`](prompts/context.md), [`brain/context.md`](brain/context.md)
- CLI assets: [`templates/context.md`](templates/context.md), [`shortcuts/context.md`](shortcuts/context.md)
- Release notes: [`CHANGELOG.md`](CHANGELOG.md)
- IDE settings: [`./.idea/context.md`](.idea/context.md)
- Additional docs: [`docs/context.md`](docs/context.md)

## Key Entry Points
- `index.js`: bootstraps the agent loop, handles `templates`/`shortcuts` subcommands, exposes helpers for tests, honours startup flags (`--auto-approve`, `--nohuman`).
- `src/agent/loop.js`: orchestrates OpenAI interactions (AbortController cancellation, approval flow, built-ins including `quote_string`/`unquote_string`).
- `src/commands/run.js`: sandbox for process execution with timeout + cancellation; re-exports specialised helpers (browse/read/edit/replace/escape-string).

## Positive Signals
- Comprehensive documentation inside modules and fresh `context.md` hierarchy accelerates ramp-up for agents and humans alike.
- Cancellation support aligns with findings in `docs/openai-cancellation.md`, giving ESC handling a solid foundation.
- Tests cover major utilities and end-to-end agent flows (command execution, reads, stats, CLI wrappers).

## Risks / Gaps
- `src/agent/loop.js` remains monolithic (~800 lines), limiting testability and readability.
- Newly introduced string quoting built-ins (`escape_string`/`unescape_string`) lack direct unit/integration coverage.
- Downstream consumers must use ESM `import()`; ensure release notes highlight the breaking change.

## Suggested First Reads for Agents
1. This file for the global picture.
2. Relevant subdirectory `context.md` files (linked above) to narrow focus quickly.
3. Associated tests (see [`tests/context.md`](tests/context.md)) to understand behavioural expectations before editing code.
