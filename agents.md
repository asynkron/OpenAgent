# Agents.md

- Start every coding task by locating the nearest `context.md` (walk from repo root downward). The directory index explains purpose, key files, and known risks—treat it as your jump table before exploring code or docs.
- Keep the context network accurate: whenever you modify code, tests, docs, prompts, or tooling, update the `context.md` in that directory and refresh any parent summaries that reference it.

## Rules for TypeScript

- Write types as if you were writing Golang.
- Avoid Record<string, unknown> and use explicit types instead.
- Avoid any.
- Avoid unknown unless absolutely necessary.
- Avoid union types unless absolutely necessary.
- Avoid generics unless absolutely necessary.
- I want the types to be as explicit as possible to make it easy to understand the data structures used in the code.
- Keep the canonical contracts under `packages/core/src/contracts/`, one file per contract, defining the runtime types shared across packages.

## Clean up existing mess

- Eliminate all instances of Record<string, unknown>, any, unknown, union types, and generics from the codebase.
- Refactor the code to use explicit types defined in the contracts folder.
- Ensure that all types are well-documented and easy to understand.
