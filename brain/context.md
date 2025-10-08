# Directory Context: brain

## Purpose & Scope

- Knowledge base for AI contributors. Offers language-specific tips (currently JavaScript-focused) to keep automated edits safe.

## Key Files

- `javascript.md` — reminders on syntax validation, dependency management, and AST inspection commands.

## Positive Signals

- Provides ready-to-run shell snippets that automated agents can execute to validate syntax or inspect ASTs.

## Risks / Gaps

- Content is sparse (only JavaScript). Other languages referenced by probes (Rust, Python, etc.) lack guidance here.
- Instructions emphasize manual commands; consider automating them in scripts for consistency.

## Related Context

- Tooling scripts: [`../scripts/context.md`](../scripts/context.md).
- CLI language probes: [`../src/cli/bootProbes/context.md`](../src/cli/bootProbes/context.md).
