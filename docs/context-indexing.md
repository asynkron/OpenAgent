# Context Indexing Guide

## Directory Purpose

Clarify how `context.md` files are organized, updated, and cross-referenced so contributors can navigate project knowledge efficiently.

## Hierarchy Rules

- Each top-level directory containing source or docs must have a `context.md` describing purpose and key files.
- Subdirectories inherit context; add child `context.md` only when new responsibilities emerge.
- Summaries must link upward (parent) and across (related directories) to maintain navigability.

## Update Checklist

1. After modifying code or docs, update the local `context.md` with the rationale and impacted files.
2. If changes shift responsibilities between directories, adjust parent summaries accordingly.
3. Run `npm run lint docs -- --ext .md` to verify Markdown lint rules (custom script TBD).
4. Record cross-links in `docs/docs-crosslinks.md` to keep the matrix current.

## Known Risks

- Orphaned directories without context, leading to duplicated or outdated knowledge.
- Missing cross-links between prompts, docs, and implementation hotspots.
- Unclear ownership when context files are not updated after major refactors.

## Maintenance Cadence

- **Weekly**: Spot-check recently touched directories and confirm their `context.md` entries remain accurate.
- **Monthly**: Audit the entire tree using `find . -name context.md` and fill in missing summaries.

## Related Documents

- [docs/docs-crosslinks.md](./docs-crosslinks.md)
- [docs/ops-overview.md](./ops-overview.md)
- [docs/prompt-maintenance.md](./prompt-maintenance.md)
