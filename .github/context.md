# Directory Context: .github

## Purpose & Scope
- Houses GitHub-specific automation and metadata. Primarily composed of workflow definitions under [`workflows/`](workflows/context.md).

## Key Contents
- `workflows/` — CI/CD pipelines for lint/test, release tagging, and npm publishing.

## Positive Signals
- Keeps repository automation declarative and versioned alongside the codebase.
- Workflows integrate linting and testing gates before releases, reducing production regressions.

## Risks / Gaps
- No issue templates or discussion configs; community workflows rely on defaults.

## Related Context
- Workflow details: [`workflows/context.md`](workflows/context.md).
- Parent overview: [`../context.md`](../context.md).
