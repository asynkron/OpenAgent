# Class and interface refactoring opportunities

The runtime is already leaning on classes such as `ApprovalManager` and `HistoryCompactor`. This note tracks remaining and recently completed refactor candidates so future maintainers can see which helpers were promoted to explicit classes or still need attention.

## Async queue -> `AsyncQueue` class ✅

- **Status:** Implemented — `src/utils/asyncQueue.js` now exports an `AsyncQueue` class while keeping `createAsyncQueue()` as a thin compatibility wrapper.
- **Original rationale:** Replace the factory with a small `AsyncQueue` class that hides the sentinel symbol and exposes `push`, `close`, `next`, and `[Symbol.asyncIterator]`.

## Prompt coordination -> `PromptCoordinator` class ✅

- **Status:** Implemented — `createPromptCoordinator` was replaced with a dedicated `PromptCoordinator` class in `src/agent/promptCoordinator.js` that the runtime instantiates.
- **Original rationale:** Extract the nested helper into a class that receives `emitEvent` and `escController` dependencies in the constructor so alternative UIs can implement the same contract.

## CLI thinking indicator -> `ThinkingIndicator` class

- **Current shape:** `thinking.js` keeps module-level `intervalHandle` and `animationStart` state and exposes global `startThinking`/`stopThinking`. That makes concurrent indicators impossible and forces implicit singletons during tests.
- **Suggested change:** Wrap the animation in a class with explicit `start`/`stop` methods and an interface (`ThinkingIndicator`) that the CLI runtime can depend on. The module can export a default singleton for backwards compatibility while letting tests instantiate isolated indicators.
- **Why it helps:** Encapsulating the timer logic clarifies ownership of resources like intervals and stdout writes. It also lets alternative front-ends swap a no-op implementation that satisfies the interface without reaching into module globals.
- **Effort:** Low-to-moderate — most call sites are already using method-like functions.

## Command preapproval -> `CommandApprovalService` ✅

- **Status:** Implemented — `src/commands/preapproval.js` now centres on the `CommandApprovalService` class with a default singleton export for the CLI.
- **Original rationale:** Move the module-level session state into an injectable service that offers `isPreapprovedCommand`, `approveForSession`, and friends.
