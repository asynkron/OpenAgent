# Modernization roadmap

This roadmap captures a staged approach for cleaning up the OpenAgent codebase, migrating to ECMAScript modules, and introducing automated quality gates.

## 1. Stabilize the current surface

- [ ] **Inventory the runtime entry points.** Confirm `index.js` is the only Node entry point and identify any scripts in `src/cli`, `src/commands`, and `src/templates` that are invoked directly.
- [ ] **Add smoke tests for critical behaviours.** The Jest suite currently focuses on utilities; expand coverage to the agent loop and CLI glue before refactors to ensure we can detect regressions.

## 2. Introduce automatic formatting and linting (this change)

- [x] **Prettier for consistent formatting.** Add a repo-wide Prettier configuration and `npm run format` helper so files are easy to normalize after refactors.
- [x] **ESLint for structural issues.** Configure ESLint with the Prettier bridge and a `npm run lint` script. The initial configuration targets our CommonJS code today but can be tightened as we migrate.
- [ ] **CI integration.** Follow up by wiring the lint and format checks into the existing automation (e.g. GitHub Actions) so every PR gets signal automatically.

## 3. Plan the CommonJS → ESM migration

1. **Lock in the module strategy.**
   - Standardize on Node's native `import`/`export` syntax by setting `"type": "module"` in `package.json`.
   - During the transition we routed CommonJS entry points through a compatibility helper; as of v2.0 that shim has been removed along with the `legacy/` tree.
   - Where external libraries still publish CommonJS, use `createRequire` as a narrow compatibility shim.
2. **Split migration into layers.**
   - Start with leaf utility modules in `src/utils` and `src/config`, rewrite `module.exports` → `export` and `require` → `import`.
   - Migrate shared infrastructure (`src/openai`, `src/cli`), verifying Jest tests are updated to use dynamic `import()` when necessary.
   - Finally update top level entry points (`index.js`, CLI bins) once all dependencies are ESM.
3. **Update toolchain support.**
   - Switch Jest to the ESM-aware configuration (`"type": "module"`, `transform` stubs, or migrate to `ts-jest` alternative) so the suite still runs.
   - Enable ESLint's ESM parser mode (`sourceType: "module"`) and add `import/order` checks to keep imports tidy.
4. **Validate and deprecate CommonJS exports.** Provide compatibility notes in the README for downstream consumers who may still rely on `require()`; mark the breaking change when removing support entirely.

## 4. Tame the runtime structure

- **Extract cohesive services.**
  - Promote the OpenAI client helpers into a small `OpenAIService` class that encapsulates configuration, rate limiting, and memoisation rather than sharing mutable state through module variables.
  - Wrap CLI side-effects (`startThinking`, `stopThinking`, render helpers) behind a presenter class to centralise terminal IO behaviour.
- **Inject dependencies explicitly.** Instead of passing large bags of functions through `createAgentLoop`, define lightweight classes (`AgentEnvironment`, `CommandExecutor`) whose public methods are consumed by the loop. This reduces the “ball of mud” feel without overcomplicating things.
- **Isolate configuration loading.** Move environment-variable parsing and template discovery into dedicated modules with pure functions so they are easier to unit test.

## 5. Optional TypeScript adoption

Once the module migration stabilises, consider introducing TypeScript (or JSDoc typedefs) for key subsystems. This enables richer editor tooling and can surface interface mismatches early.

1. **Pilot on leaf modules.** Start by annotating `src/utils` with TypeScript or JSDoc types so that the build tooling remains close to plain JavaScript while developers gain type-checking signal.
2. **Adopt incremental compilation.** Introduce `ts-node` or Babel-based transpilation only after the initial pilots demonstrate value. Keep the TypeScript configuration (`tsconfig.json`) minimal—`strict: true`, `checkJs: true`—to avoid churn.
3. **Bridge Jest and ESLint.** Update the Jest configuration to understand `.ts` and `.cts` files and enable ESLint's TypeScript parser with rules that reinforce the new types without blocking mixed JS/TS code.
4. **Document contributor expectations.** Publish guidelines for when to author new modules in TypeScript, how to handle declaration files, and how to migrate existing CommonJS tests.

## 6. Rollout strategy

1. Apply the tooling upgrades (formatting, lint) and document contributor expectations.
2. Migrate utilities to ESM in small pull requests, running `npm run lint` + `npm test` to verify at each step.
3. Introduce the service classes progressively while keeping function APIs intact; update the agent loop only after the supporting classes exist.
4. Clean up residual TODOs, remove unused code paths, and document the final architecture.

## 7. Observability and performance feedback loops

1. **Instrument critical paths.** Add lightweight logging or metrics hooks around agent loop iterations, command execution, and OpenAI API interactions so regressions surface quickly during the migration.
2. **Track performance baselines.** Capture baseline timings before each major refactor (module conversion, service extraction) and compare them post-change to avoid unintentional slowdowns.
3. **Automate regression detection.** Where feasible, integrate simple benchmarks or synthetic tasks into CI to guard against significant runtime regressions.

## 8. Change management and communication

1. **Publish upgrade notes.** Maintain a running changelog that highlights ESM breaking changes, new service abstractions, and any CLI flag adjustments that downstream automation must incorporate.
2. **Host knowledge-sharing sessions.** After each major phase, circulate internal walkthroughs or Loom videos explaining the new patterns so contributors can ramp up quickly.
3. **Schedule regular retrospectives.** Every few iterations, review the modernization progress, re-evaluate scope, and decide whether future phases require resequencing based on lessons learned.

Following these phases gives us quick quality wins now while charting a safe path towards a modern, modular architecture.
