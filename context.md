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
- Legacy CLI console helpers (rendering, readline IO, spinners, plan/command formatters) are now TypeScript-checked, shrinking the remaining surface that depended on `@ts-nocheck`.

## Risks / Gaps

- Runtime behavior depends on persisted state in `.openagent/plan.json`; stale snapshots can confuse follow-up sessions and tests if not cleaned between runs even though the file is now gitignored.
- Node dependencies are vendored via `node_modules/`; context indexing intentionally excludes them to avoid noise, so consult package docs when diving into third-party APIs.
- No single architectural diagram ties the subsystems together—use the directory contexts plus `docs/` to reconstitute mental models.

## Maintenance Notes

- Whenever code, docs, or prompts change, update the nearest `context.md` (and parent summaries) so the index remains trustworthy.
- README now opens with `![Screenshot](./screenshot.png)` to preview the CLI.
- Cross-reference sibling directories if behavior spans subsystems (e.g., CLI rendering ↔ agent runtime).
- TypeScript scaffolding now lives at the workspace root via `tsconfig.json` plus `npm run typecheck` for incremental adoption; compiled JavaScript still ships from package directories until the build pipeline is fully converted.
- Static analysis via FTA: `npm run fta` wraps the bundled `fta-cli` dev dependency to score the TypeScript in `packages/*` before sizable refactors.
- Latest FTA run (2025-03-17) flagged CLI ink components, the core pass executor, and web chat service as top hotspots; see `todo.md` for remediation tasks tracking those files.
- Root `npm run build` compiles `@asynkron/openagent-core` first and then fans out to every workspace (`npm run build --workspaces --if-present`) so downstream TypeScript packages resolve its emitted types.
- The CLI package (`packages/cli`) still compiles TypeScript sources into `dist/` on demand via its own `npm run build`, and the root `npm start` relies on `prestart` running `npm run build` to ensure fresh artifacts before delegating to the CLI.
- `packages/core` compiles its `src/**/*.ts` sources into `dist/` via `npm run build --workspace @asynkron/openagent-core` before publishing.
- Jest runs TypeScript sources through `babel-jest` (see `jest.config.mjs`), so suites now execute without the legacy `ts-jest` shim that previously blocked execution.
- Root `npm test` now triggers `npm run build` via `pretest`, guaranteeing Jest runs against freshly emitted TypeScript output from every workspace.
- Prettier and ESLint ignore templates now exclude generated build output (`packages/**/dist`, `scripts/dist`) so formatting/lint runs only touch authored sources.
- ESLint's TypeScript profile now tolerates legacy surfaces (`@ts-nocheck`, `any`, empty interface shims) so repo-wide `npm run lint` finishes without errors; warnings remain for untyped areas until those modules are modernized.
- Third-party gaps like `marked-terminal` now ship custom declaration stubs under `types/` so strict type-checking keeps working without upstream DefinitelyTyped coverage.

## Related Context

- Tooling & ops: [`scripts/context.md`](scripts/context.md) and [`.github/context.md`](.github/context.md).
- Runtime state: [`.openagent/context.md`](.openagent/context.md).
- IDE/project metadata: [`.vscode/context.md`](.vscode/context.md). JetBrains `.idea/` settings are local-only.

## CLI Runner Investigation (2025-10-11)

- Initial investigation reproduced out-of-memory crashes triggered by `packages/cli/src/__tests__/runner.test.js` whenever `runCli()` executed during the suite.
- Minimal test scaffolding (console spies, Ink mock) stayed stable, pointing at boot flows in `runCli()` or its dependencies as the source of heavy allocations.

### Status Update (2025-10-11)

- Re-ran `npm test -- packages/cli/src/__tests__/runner.test.js`; the suite now passes in ~0.22 s with no OOM behavior.
- Keep profiling hooks handy (e.g., `node --inspect`, targeted logging) if the leak resurfaces during full CLI sessions outside the test harness.
