# Directory Context: brain

## Purpose

- Houses fast-reference guides the agent should consult before editing specific classes of files.
- Supplements the system/developer prompts with operational tips (e.g., JavaScript syntax checks, temp file hygiene).

## Key Files

- `javascript.md`: reminds the agent to run `node --check` and keep dependencies in sync; includes AST exploration snippets.
- `patch-or-temp-files.md`: emphasises cleaning up temporary files and staging patches outside the repo tree.

## Positive Signals

- Gives actionable pre-flight checklists that reduce common mistakes (syntax errors, leftover temp files).

## Risks / Gaps

- Coverage is narrow—missing language- or subsystem-specific notes (e.g., OpenAI client, CLI UX).
- Guidance is static; lacks cross-links to the new `context.md` index.

## Related Context

- Repository overview: [`../context.md`](../context.md)
