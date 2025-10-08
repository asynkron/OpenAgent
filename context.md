# Directory Context: /

## Purpose & Scope
- Monorepo root for the OpenAgent project: a Node.js CLI agent that brokers structured conversations with OpenAI and executes shell/read commands with human-in-the-loop approvals.
- Hosts source runtime (`src/`), CLI entry points (`bin/`), prompts & schemas that govern the JSON protocol, documentation, and automated tests.

## Key Subsystems
- `src/` — runtime, CLI renderer, OpenAI client adapters, and utilities. See [`src/context.md`](src/context.md).
- `tests/` — Jest unit/integration suites with mock OpenAI harnesses. See [`tests/context.md`](tests/context.md).
- `prompts/` & `schemas/` — authoritative protocol prompts plus JSON schema for validation. Linked details in [`prompts/context.md`](prompts/context.md) and [`schemas/context.md`](schemas/context.md).
- `docs/` — design notes, operational guides, and meta documentation for contributors. See [`docs/context.md`](docs/context.md).
- `scripts/` — maintenance utilities for editing code, validating assets, and release hygiene. See [`scripts/context.md`](scripts/context.md).
- Operational metadata: `.github/` workflows, `.githooks/` local hooks, `.idea/` IDE settings, `.openagent/` runtime plan snapshots.

## Positive Signals
- Comprehensive automated coverage: unit suites exercise nearly every agent subsystem while integration tests validate the full runtime loop with mocked OpenAI responses.
- Clear separation between transport (`src/bindings`), presentation (`src/cli`), agent orchestration (`src/agent`), and side effects (`src/commands`, `src/services`).
- Documentation spans architecture, ops, and prompt maintenance, reducing ramp-up time for new contributors (especially AI assistants).

## Risks / Gaps
- Runtime behavior depends on persisted state in `.openagent/plan.json`; stale snapshots can confuse follow-up sessions and tests if not cleaned between runs.
- Node dependencies are vendored via `node_modules/`; context indexing intentionally excludes them to avoid noise, so consult package docs when diving into third-party APIs.
- No single architectural diagram ties the subsystems together—use the directory contexts plus `docs/` to reconstitute mental models.

## Maintenance Notes
- Whenever code, docs, or prompts change, update the nearest `context.md` (and parent summaries) so the index remains trustworthy.
- Cross-reference sibling directories if behavior spans subsystems (e.g., CLI rendering ↔ agent runtime).

## Related Context
- Tooling & ops: [`scripts/context.md`](scripts/context.md), [`.github/context.md`](.github/context.md), [`.githooks/context.md`](.githooks/context.md).
- Runtime state: [`.openagent/context.md`](.openagent/context.md).
- IDE/project metadata: [`.idea/context.md`](.idea/context.md).
