To gather which files changes the most over time, run

```bash
git log --no-merges --diff-filter=ACMR --since="1 month ago" --pretty=format: --name-only \
| sed '/^$/d' \
| sort \
| uniq -c \
| sort -nr \
| head -10
```

"1 month ago" can be changed to whatever time frame you want to analyze.
"head -10" can be changed to show more or fewer files.

This gives us a good idea about volatility of files in the repository.
If something changes a lot, then maybe there is a need for better abstractions or
modularization.

To get the changes for one of these files, run

```bash
git log --no-merges --diff-filter=ACMR --since="1 month ago" \
  --date=short --pretty="format:%h %ad %an %s" -p -- path/to/file
```

Replace "path/to/file" with the actual file path you want to analyze.

Based on this information, we can identify "hot code" areas in the codebase that may require attention.
Try to reason about why these files change so often and if there are ways to improve their stability.

Generate a report summarizing the findings and suggesting potential improvements.

## based on these findings, ignore changes that are to be expected, documentation updates, formatting changes, dependency updates, etc.

### Hot-code analysis {timespan}

<!--insert table-->

| File | Touches | Change Themes |

#### Key observations

<!--example observations-->

- Runtime reshaping (index.js, src/agent/loop.js, src/cli/render.js): Rapid iteration to decouple CLI from library APIs, introduce event-stream runtime, persist plans, and add debug instrumentation. Overlap between files suggests incomplete modular boundaries.
- Process documents & manifests (prompts/_.md, context.md, package_.json): Frequent edits track evolving SOPs and dependencies—signals that conventions are still settling.

#### Recommended stabilisation steps

<!--example recommendations-->

1. Finalize runtime abstraction: Extract plan management, debug emission, and command execution into dedicated modules with contracts + tests. This will reduce multi-file ripple effects when features update.
2. Lock interface boundaries: Publish TypeScript (or JSDoc) definitions for exported runtime APIs and event payloads; enforce via lint/tests so CLI consumers stay insulated from refactors.
3. Documented release checkpoints: After each major runtime milestone, freeze prompts/\*.md and root context.md by running a structured review to curb continual documentation rewrites.
4. Dependency hygiene: Adopt a changeset/release-notes workflow so package.json/package-lock.json updates tie to intentional version bumps, reducing noisy churn.

Implementing the above should lower volatility across the hot files while preserving the recent architectural gains.

Return result to user on screen.
