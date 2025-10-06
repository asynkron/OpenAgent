# Directory Context: .idea

## Purpose

- JetBrains IDE project configuration tracked for contributors using IntelliJ/WebStorm.
- Stores workspace-specific settings (modules, encodings, Copilot migration flags) to keep editor behaviour consistent.

## Key Artifacts

- `misc.xml`, `modules.xml`, `OpenAgent.iml`: project/module metadata for indexing.
- `codeStyles/` (see [`codeStyles/context.md`](codeStyles/context.md)): formatting preferences shared across the IDE.
- `workspace.xml`: per-user window layout snapshot (safe to ignore for automation).

## Positive Signals

- Provides reproducible IDE setup, reducing ramp-up time when opening the project in JetBrains tools.

## Risks / Gaps

- Files are IDE-specific noise for non-JetBrains users; changes should be minimized to avoid churn in reviews.
- No documentation explaining which settings are intentional vs. incidental.

## Related Context

- Parent overview: [`../context.md`](../context.md)
- Child configuration: [`codeStyles/context.md`](codeStyles/context.md)
