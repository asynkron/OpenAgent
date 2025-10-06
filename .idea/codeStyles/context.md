# Directory Context: .idea/codeStyles

## Purpose

- Captures JetBrains code-style configuration so local formatting matches shared expectations.

## Key Artifacts

- `codeStyleConfig.xml`: toggles the project-level scheme and inherits IDE defaults.

## Positive Signals

- Ensures JetBrains auto-formatting stays aligned with repo preferences when contributors rely on the IDE.

## Risks / Gaps

- Duplicates knowledge already enforced by ESLint/Prettier; drift between tools can confuse contributors.

## Related Context

- Parent IDE settings: [`../context.md`](../context.md)
