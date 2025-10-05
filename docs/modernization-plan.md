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

1. **Decide on module strategy.**
   - Prefer flipping the project to ESM by adding `"type": "module"` in `package.json`.
   - Where external libraries still publish CommonJS, use `createRequire` as a narrow compatibility shim.
2. **Split migration into layers.**
   - Start with leaf utility modules in `src/utils` and `src/config`, rewrite `module.exports` → `export` and `require` → `import`.
   - Migrate shared infrastructure (`src/openai`, `src/cli`), verifying Jest tests are updated to use dynamic `import()` when necessary.
   - Finally update top level entry points (`index.js`, CLI bins) once all dependencies are ESM.
3. **Update toolchain support.**
   - Switch Jest to the ESM-aware configuration (`"type": "module"`, `transform` stubs, or migrate to `ts-jest` alternative) so the suite still runs.
   - Enable ESLint's ESM parser mode (`sourceType: "module"`) and add `import/order` checks to keep imports tidy.
4. **Validate and deprecate CommonJS exports.** Provide compatibility notes in the README for downstream consumers who may still rely on `require()`.

## 4. Tame the runtime structure

- **Extract cohesive services.**
  - Promote the OpenAI client helpers into a small `OpenAIService` class that encapsulates configuration, rate limiting, and memoisation rather than sharing mutable state through module variables.
  - Wrap CLI side-effects (`startThinking`, `stopThinking`, render helpers) behind a presenter class to centralise terminal IO behaviour.
- **Inject dependencies explicitly.** Instead of passing large bags of functions through `createAgentLoop`, define lightweight classes (`AgentEnvironment`, `CommandExecutor`) whose public methods are consumed by the loop. This reduces the “ball of mud” feel without overcomplicating things.
- **Isolate configuration loading.** Move environment-variable parsing and template discovery into dedicated modules with pure functions so they are easier to unit test.

## 5. Optional TypeScript adoption

Once the module migration stabilises, consider introducing TypeScript (or JSDoc typedefs) for key subsystems. This enables richer editor tooling and can surface interface mismatches early.

## 6. Rollout strategy

1. Apply the tooling upgrades (formatting, lint) and document contributor expectations.
2. Migrate utilities to ESM in small pull requests, running `npm run lint` + `npm test` to verify at each step.
3. Introduce the service classes progressively while keeping function APIs intact; update the agent loop only after the supporting classes exist.
4. Clean up residual TODOs, remove unused code paths, and document the final architecture.

Following these phases gives us quick quality wins now while charting a safe path towards a modern, modular architecture.
