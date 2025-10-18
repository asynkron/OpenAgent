# Directory Context: tests/integration/utils

## Purpose & Scope

- Shared utilities used by integration suites to prepare the CLI runtime and UI harness without repeating environment setup code.

## Key Files

- `cliTestHarness.ts` — boots the mocked CLI agent with consistent defaults (environment flag, runtime wiring, UI harness creation) while allowing tests to override command handlers and approval behaviors.
