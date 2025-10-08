# Operations Overview

## Purpose

This document outlines the day-to-day operational responsibilities that keep the OpenAgent project healthy and predictable.

## Core Responsibilities

- Monitor CI pipelines and address build or test regressions.
- Ensure dependencies remain up-to-date and compatible with the supported Node.js version.
- Review incoming issues and triage them into actionable tasks or documentation updates.
- Maintain the documentation index so contributors can discover the right guidance quickly.

## Tooling Checklist

| Task                 | Tooling                                                      | Frequency                   |
| -------------------- | ------------------------------------------------------------ | --------------------------- |
| Linting & formatting | `npm run lint`, `npm run format:check`                       | Before each release         |
| Test suite           | `npm test`                                                   | On every substantive change |
| Schema validation    | `npm run test -- --runTestsByPath tests/json-schema.test.js` | Weekly                      |
| Dependency audit     | `npm audit`                                                  | Monthly                     |

## Maintenance Cadence

- **Daily**: Review open pull requests, approve safe command templates, and skim error logs.
- **Weekly**: Run the full quality tooling checklist and update the docs cross-link matrix.
- **Monthly**: Revisit operational runbooks, confirm context indexes are fresh, and archive outdated TODO items.

## Escalation Path

1. Attempt reproduction locally and gather logs.
2. Create or update the relevant issue in the tracker with findings.
3. Flag the maintainer-on-call in the `#openagent-maintainers` channel.
4. If the issue impacts production automation, initiate a hotfix branch and document the mitigation steps in `docs/ops-overview.md`.

## Related Documents

- [docs/prompt-maintenance.md](./prompt-maintenance.md)
- [docs/context-indexing.md](./context-indexing.md)
- [docs/docs-crosslinks.md](./docs-crosslinks.md)
- [docs/faq.md](./faq.md)
