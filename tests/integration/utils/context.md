# Directory Context: tests/integration/utils

## Purpose & Scope

- Shared utilities used by integration suites to prepare the CLI runtime and UI harness without repeating environment setup code.

## Key Files

- `cliTestHarness.ts` — boots the mocked CLI agent with consistent defaults (environment flag, runtime wiring, UI harness creation) while allowing tests to override command handlers and approval behaviors.
- `planBuilder.ts` — centralizes plan scaffolding and handshake helpers so suites reuse the same command defaults without duplicating setup code.
- `eventExpectations.ts` — provides focused helpers for asserting runtime events without copy/pasted predicate chains.
