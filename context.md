# OpenAgent Codebase Context

## Purpose & Scope

- Node.js CLI agent that converses with an LLM via a strict JSON protocol, renders assistant plans/messages, and executes shell commands under human approval.
- Source lives entirely under `src/` using native ESM modules; CommonJS support was removed in v2.0.

## Quick Directory Map

- Core runtime overview: [`src/context.md`](src/context.md)
- Tests: [`tests/context.md`](tests/context.md)
- Prompts & agent guidance: [`prompts/context.md`](prompts/context.md), [`brain/context.md`](brain/context.md)
- JSON schema definitions: [`schemas/context.md`](schemas/context.md)
- Operational docs: [`docs/context.md`](docs/context.md)
- Automation scripts: [`scripts/context.md`](scripts/context.md)
- Package entry point: [`index.js`](index.js) forwards to the CLI runner and library exports.

## Release & Automation

- Merging to `main` triggers `.github/workflows/auto-release.yml`, which bumps the minor npm version, tags the commit, and hands off to `.github/workflows/publish.yml` for npm publication.
- `scripts/verify-release-tag.js` keeps the Git tag aligned with `package.json`.
- `scripts/validate-json-assets.js` validates prompt manifests against their JSON schema and enforces copy synchronization.
- Local commits should run `.githooks/pre-commit`, which formats staged files with Prettier and fixes lint issues via `lint-staged`. Run `git config core.hooksPath .githooks` once per clone to enable it.

## Key Entry Points

- `src/lib/index.js`: aggregates CLI-agnostic exports for programmatic consumers.
- `src/cli/runner.js`: parses CLI flags, applies startup configuration, and launches the agent runtime.
- `src/agent/loop.js`: orchestrates the conversation loop, delegating individual passes to `passExecutor.js` while coordinating approvals and ESC cancellation state.
- `src/commands/run.js`: sandbox for process execution with timeout/cancellation plumbing and built-in command helpers (read/TODO: update docs).
- `src/openai/client.js`: memoizes the OpenAI Responses client with configuration validation.

## Recent Improvements

- Agent loop responsibilities split across `loop.js`, `passExecutor.js`, `approvalManager.js`, and `commandExecution.js`, simplifying targeted testing.
- Cancellation flow aligns with `docs/openai-cancellation.md` and is exercised by both nested unit regressions and `tests/integration/agentCancellation.integration.test.js`.

## Current Risks / Follow-ups

- Real child-process execution remains lightly covered in integration tests; periodic manual verification is advised for long-running commands.
- Model completions still rely on single-attempt JSON parsing; retries/backoff for malformed assistant output remain TODO.
- Documentation cross-links between code hotspots and long-form docs are still being expanded (tracked in `todo.md`).

## Suggested First Reads for Agents

1. This file for the global picture.
2. Subdirectory `context.md` files (linked above) to narrow focus quickly.
3. Representative integration tests in [`tests/context.md`](tests/context.md) to understand behavioural expectations before editing runtime code.
