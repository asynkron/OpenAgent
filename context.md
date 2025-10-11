# Directory Context: /

## Purpose & Scope

- Monorepo root for the OpenAgent project: a Node.js CLI agent that brokers structured conversations with OpenAI and executes shell commands with human-in-the-loop approvals.
- Hosts workspace packages (`packages/core`, `packages/cli`), prompts & schemas that govern the JSON protocol, documentation, and automated tests.

## Key Subsystems

- `packages/core/` — headless runtime, OpenAI client adapters, and shared utilities. See [`packages/core/context.md`](packages/core/context.md).
- `packages/cli/` — Ink-based CLI that depends on the core runtime. See [`packages/cli/context.md`](packages/cli/context.md).
- `tests/` — cross-package integration suites with mock OpenAI harnesses. See [`tests/context.md`](tests/context.md).
- `packages/core/prompts/` & `schemas/` — authoritative protocol prompts plus JSON schema for validation. Linked details in [`packages/core/prompts/context.md`](packages/core/prompts/context.md) and [`schemas/context.md`](schemas/context.md).
- `docs/` — design notes, operational guides, and meta documentation for contributors. See [`docs/context.md`](docs/context.md).
- Editing helpers now live under `packages/core/scripts/`; root `scripts/` retains repo maintenance utilities (JSON validation, release safety checks). See [`packages/core/scripts/context.md`](packages/core/scripts/context.md) and [`scripts/context.md`](scripts/context.md).
- Operational metadata: `.github/` workflows and `.openagent/` runtime plan snapshots. JetBrains `.idea/`
  settings are intentionally gitignored to keep the repository clean for all contributors.

## Positive Signals

- Comprehensive automated coverage: per-package unit suites (under `packages/core` and `packages/cli`) exercise nearly every agent subsystem while integration tests validate the full runtime loop with mocked OpenAI responses.
- Clear separation between the workspace packages: `packages/core` hosts orchestration/command logic while `packages/cli` owns presentation (Ink) and bootstrapping.
- Documentation spans architecture, ops, and prompt maintenance, reducing ramp-up time for new contributors (especially AI assistants).
- CLI unit tests under `packages/cli/src/**/__tests__` use `ink-testing-library` to simulate terminal input when exercising interactive components.

## Risks / Gaps

- Runtime behavior depends on persisted state in `.openagent/plan.json`; stale snapshots can confuse follow-up sessions and tests if not cleaned between runs even though the file is now gitignored.
- Node dependencies are vendored via `node_modules/`; context indexing intentionally excludes them to avoid noise, so consult package docs when diving into third-party APIs.
- No single architectural diagram ties the subsystems together—use the directory contexts plus `docs/` to reconstitute mental models.

## Maintenance Notes

- Whenever code, docs, or prompts change, update the nearest `context.md` (and parent summaries) so the index remains trustworthy.
- README now opens with `![Screenshot](./screenshot.png)` to preview the CLI.
- Cross-reference sibling directories if behavior spans subsystems (e.g., CLI rendering ↔ agent runtime).

## Related Context

- Tooling & ops: [`scripts/context.md`](scripts/context.md) and [`.github/context.md`](.github/context.md).
- Runtime state: [`.openagent/context.md`](.openagent/context.md).
- IDE/project metadata: [`.vscode/context.md`](.vscode/context.md). JetBrains `.idea/` settings are local-only.
