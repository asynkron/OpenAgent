# Code Quality Report

Before tackling any item below:
- Measure the file’s current LOC and FTA score so we have a baseline.
- After the change, recompute the same metrics. If the FTA score increases, the task is considered failed and must be redone.
- Always finish by running `npm run test`. A failing test run likewise means the task failed and must be revisited.

## packages/core
- Broadly solid test coverage and strict TS builds, but the agent loop and pass executor still hide a lot of “smart” branches behind amorphous helper calls.  A handful of legacy modules still mix DI, control-flow, and data-massaging responsibilities, which drives up cyclomatic complexity and slows down onboarding.

Top refactor targets:
- [x] `packages/core/src/agent/passExecutor.ts` – Remains ~750 LOC after recent splits; orchestration, validation, and side-effects are interwoven and still register the highest FTA score (82). Needs deeper decomposition per reasoning phase plus thinner discriminated unions for assistant responses.
- [x] `packages/core/src/agent/loop.ts` – The main runtime loop still hosts cancel logic, observer wiring, and history queue plumbing; extracting lifecycle hooks into collaborators will make the control-flow approachable.
- [ ] `packages/core/src/agent/passExecutor/planRuntime.ts` – Manages plan snapshots, observation writes, and execution state in one file. Splitting the plan state-machine from persistence hooks will reduce the current nesting depth.
- [x] `packages/core/src/openai/responses.ts` – Streams/generator plumbing, schema coercion, and provider option setup all live together; the new partial typings help, but the normalizer still deserves a dedicated module per payload branch.
- [x] `packages/core/src/agent/runtimePayloadGuard.ts` – The payload growth guard mixes metrics reporting and history dumping; carving out the logging and threshold calculations would simplify the guard loop.
- [ ] `packages/core/src/agent/promptCoordinator.ts` – Prompt queue orchestration still leans on optional chaining and loose payload types; refactoring toward an explicit state machine would remove ad-hoc checks.
- [x] `packages/core/src/agent/planManager.ts` – The merge/reset logic combines file I/O, in-memory caches, and plan diffing; splitting adapter concerns from the domain model would shrink the cognitive load.
- [x] `packages/core/src/agent/historyCompactor.ts` – Blends context window estimation, history slicing, and logging; worth extracting the token estimation and compaction strategies into targeted helpers.
- [ ] `packages/core/src/commands/run.ts` – Shell execution wraps temp files, cancellation, and result normalization; introducing a dedicated child-process adapter plus typed stderr augmenters would tame the branching.
- [ ] `packages/core/src/services/commandApprovalService.ts` – Approval policy resolution still couples async session storage with prompt formatting; isolating the persistence layer and command signature helpers would pay down technical debt.

## packages/cli
- Ink components now compile under strict TS, but two surfaces still depend on `@ts-nocheck`, and the event router shoulders most runtime branching.  Many hooks continue to clone or guard payloads manually instead of leaning on the richer core contracts.

Top refactor targets:
- [ ] `packages/cli/src/components/AskHuman.tsx` – Still `@ts-nocheck`; newline handling, slash-menu orchestration, and lock state need typed helpers to re-enable strict mode.
- [ ] `packages/cli/src/components/InkTextArea.tsx` – Key event parsing, row transforms, and caret management share a single file; splitting input parsing vs. rendering would simplify test coverage.
- [ ] `packages/cli/src/components/CliApp.tsx` – Now strongly typed, but it still handles every runtime event branch directly; extracting event routers (status, command, debug) into dedicated hooks would shrink the component.
- [x] `packages/cli/src/components/cliApp/runtimeUtils.ts` – Utility grab bag mixing cloning, integer parsing, and status normalization; deserves a separation between runtime data helpers and CLI-only coercions.
- [ ] `packages/cli/src/components/cliApp/useCommandLog.ts` – Handles timeline updates, log trimming, and slash command messaging; consider peeling the log store into a pure reducer to make the hook smaller.
- [x] `packages/cli/src/components/cliApp/useTimeline.ts` – Batches event inserts, bounded lists, and key management; factoring timeline math into a utility module would improve clarity.
- [ ] `packages/cli/src/components/cliApp/useDebugPanel.ts` – Handles payload cloning, summarization, and max-size trimming. Splitting formatting helpers from the hook will lighten repeated cloning.
- [ ] `packages/cli/src/runtime.ts` – Still mixes dependency normalization, Ink mounting, and command stats; extracting the dependency bundle into its own factory would ease extending runtime options.
- [ ] `packages/cli/src/loadCoreModule.ts` – Guard logic for dynamic imports intermingles with retry/fallback messaging; separating validation from logging would improve readability.
- [ ] `packages/cli/src/components/commandUtils.ts` – Normalizes commands, builds summaries, and formats previews; moving edit/replace detail builders into distinct modules would lower cross-coupling with themed components.

## packages/web/frontend
- Chat orchestration remains the riskiest area (FTA ~81).  The module graph improved after splitting controllers, yet several files still contain hybrid DOM + state management logic that’s difficult to test in isolation.

Top refactor targets:
- [ ] `packages/web/frontend/src/js/services/chat.ts` – Still the central socket orchestrator; needs a slimmer core that delegates DOM mutations entirely to controllers.
- [x] `packages/web/frontend/src/js/services/chat_socket.ts` – Reconnection logic and event fan-out could move into a reusable transport adapter.
- [ ] `packages/web/frontend/src/js/services/chat_router.ts` – Dispatch tables blend payload coercion with side-effects; consider introducing typed command objects per event.
- [ ] `packages/web/frontend/src/js/services/chat_sessionController.ts` – Outstanding TODOs around optimistic queue management; isolating session state into pure reducers would reduce mutable patterns.
- [ ] `packages/web/frontend/src/js/services/chat_domController.ts` – Handles low-level DOM construction and state gating; templating helpers would reduce duplicated element creation.
- [ ] `packages/web/frontend/src/js/services/chat_eventDisplay.ts` – Body selection heuristics are still ad-hoc; codifying banner/status rendering rules would prevent regressions.
- [ ] `packages/web/frontend/src/js/services/chat_inputController.ts` – Key event handling remains sprawling; extract caret/shortcut handling into pure utilities.
- [ ] `packages/web/frontend/src/js/components/plan_model.ts` – Combines tree normalization and highlight handling; splitting schema transforms from rendering decisions would tidy the module.
- [ ] `packages/web/frontend/src/js/services/chat_model.ts` – Serializes responses to the DOM; needs better typing and separation between history transforms and summary building.
- [ ] `packages/web/frontend/src/js/services/chat_dom.ts` – Low-level DOM helpers still rely on implicit document globals; moving to explicit dependency injection would ease unit testing.

## packages/web/backend
- The backend codebase is smaller but still entangles socket lifecycle with agent runtime wiring.

Top refactor targets:
- [ ] `packages/web/backend/src/server/agentSocket.ts` – Largest file; could use better separation between WebSocket lifecycle, runtime binding, and log formatting.
- [ ] `packages/web/backend/src/server/utils.ts` – Normalizes payloads and command logs; splitting serialization helpers from runtime adapters would aid reuse.
- [ ] `packages/web/backend/src/server.ts` – HTTP + WS orchestration in one file; consider a dedicated bootstrap layer to keep handlers lean.
- [ ] `packages/web/backend/src/index.ts` – Boot wiring mixes env configuration and server start; factoring an env loader would simplify offline testing.
- [ ] `packages/web/backend/src/services/commandProxy.ts` (if/when reintroduced) – Keep an eye on command forwarding logic; it historically used loose typings.

## packages/scripts
- Utility scripts are concise but lightly tested. `scripts/dist` outputs rely on manual inspection; adding smoke tests would help.
- Prioritize refactors for:
  - [ ] `scripts/src/ensure-esbuild.ts` – error handling is still callback-based.
  - [ ] `scripts/src/format-plan.ts` – mixing CLI parsing with JSON transforms; split into modules.

## tests
- Integration suites provide good coverage but remain slow.  Opportunities:
  - [ ] Consolidate repeated CLI boot helpers under `tests/integration/utils`.
  - [ ] Move snapshot-less expectation helpers into shared utilities to cut duplication.
