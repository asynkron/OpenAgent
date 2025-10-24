# Directory Context: golang

## Purpose & Scope

- Hosts a Go implementation of the OpenAgent core runtime plus a console entrypoint.
- Mirrors the behaviour of `packages/core` in TypeScript: prompts the model using the canonical tool schema, executes plan steps, and surfaces observations.

## Key Subdirectories

- `cmd/openagent/` — CLI wrapper that reads flags, pulls the API key from `OPENAI_API_KEY`, and starts the runtime.
- `internal/core/` — Go translation of the core runtime contracts and loop. Contains the plan manager, OpenAI client wrapper, command executor, and shared schema constants.

## Usage Notes

- Run `go run ./cmd/openagent` (inside `golang/`) after exporting `OPENAI_API_KEY`. Flags mirror the CLI experience: `--auto-approve`, `--no-human`, `--augment`, `--plan-reminder`, and `--auto-message`.
- The runtime relies on the Chat Completions API and enforces the exact JSON schema defined in the TypeScript workspace to keep responses aligned across implementations.
- Command execution currently shells out via `exec.CommandContext` with `-c`; adjust the executor if a different shell strategy is required on Windows.

## Maintenance Notes

- Whenever the TypeScript schema changes, update `internal/core/schema/schema.go` and the accompanying constants to preserve parity.
- `internal/core/runtime/runtime.go` keeps the loop readable by delegating plan execution to `plan_manager.go` and observations to `command_executor.go`; mimic that separation for future features (virtual commands, approvals, etc.).
