# Agents.md

- Start every task by locating the nearest `context.md` (walk from repo root downward). The directory index explains purpose, key files, and known risks—treat it as your jump table before exploring code or docs.
- Keep the context network accurate: whenever you modify code, tests, docs, prompts, or tooling, update the `context.md` in that directory and refresh any parent summaries that reference it.
- If no human task is provided, pull work from `todo.md` and progress sequentially until complete or blocked.
- After running required tests or checks, commit promptly so history stays granular.
