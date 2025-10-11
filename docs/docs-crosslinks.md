# Documentation Cross-Links

## Purpose

Maintain a living index that connects project documentation to relevant implementation hotspots, ensuring contributors can jump straight from narrative guidance to executable code.

## Cross-Link Matrix

| Area                 | Documentation                  | Implementation Hotspots                                                                           |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Operations Runtime   | `docs/ops-overview.md`         | `packages/core/src/agent/loop.js`, `packages/cli/src/runner.js`, `.github/workflows/`             |
| Prompt Sync          | `docs/prompt-maintenance.md`   | `scripts/sync-prompts.cjs`, `packages/core/prompts/context.md`, `brain/` mirrors, `docs/context-indexing.md` |
| Context Indexing     | `docs/context-indexing.md`     | Directory `context.md` files under `src/`, `docs/`, `brain/`, `docs/docs-crosslinks.md`           |
| CLI Safety           | `docs/faq.md` (safety section) | `packages/core/src/agent/approvals/`, `tests/integration/approvals.test.js`                       |

## Adding New Cross-Links

1. Identify the documentation page and code modules impacted by your change.
2. Update the table above, adding rows as needed.
3. Ensure each link uses relative paths for portability.
4. Mention the update in the relevant `context.md` so the index stays synchronized.

## Review Frequency

- Update alongside any documentation or implementation change that affects contributor workflows.
- Perform a quarterly audit to confirm entries remain accurate and comprehensive.

## Related Documents

- [docs/ops-overview.md](./ops-overview.md)
- [docs/prompt-maintenance.md](./prompt-maintenance.md)
- [docs/context-indexing.md](./context-indexing.md)
- [docs/faq.md](./faq.md)
