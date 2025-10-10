# Frequently Asked Questions

## How do I keep prompts in sync?

Run `npm run scripts:sync-prompts`, commit the updated prompt files, and confirm the changes with `git diff`. See [docs/prompt-maintenance.md](./prompt-maintenance.md) for the full workflow.

## Where do I document architectural changes?

Update the closest directory `context.md` and reflect the change in the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix. Major operational shifts also belong in [docs/ops-overview.md](./ops-overview.md).

## What tests must pass before merging?

- `npm run lint`
- `npm test`
- Schema validation (part of the test suite) whenever prompts, templates, or shortcuts change.

## How do I enable the repo's Git hooks?

The hooks live in `.githooks/` and are opt-in. Point Git at that directory once per clone:

```bash
git config core.hooksPath .githooks
```

From then on, every `git commit` runs the bundled `pre-commit` hook, which calls `lint-staged` so only staged files are auto-formatted (`prettier --write`) and linted (`eslint --fix`). If you ever need to run the same cleanup manually, use `npx lint-staged` or the broader `npm run format` / `npm run lint` scripts.

## How often should I audit documentation?

Follow the cadence in [docs/ops-overview.md](./ops-overview.md): weekly spot-checks and monthly full audits of context indexes and cross-links.

## Who to contact for urgent issues?

Escalate to the maintainer-on-call via `#openagent-maintainers` with logs, reproduction steps, and any mitigation actions already taken.

## Where can I find implementation hotspots quickly?

Consult the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix for direct links to relevant code modules.

## What does a schema-validated `open-agent` tool response look like?

The runtime expects the assistant to return JSON that matches `RESPONSE_PARAMETERS_SCHEMA` before any commands are executed. A minimal successful payload might look like this:

```jsonc
{
  "message": "Confirmed the repo is synced with origin main.",
  "plan": [
    {
      "step": "1",
      "title": "Check git status",
      "status": "completed"
    },
    {
      "step": "2",
      "title": "Sync with origin/main",
      "status": "completed"
    }
  ],
  "command": {
    "reason": "List repository contents so the user can inspect the workspace.",
    "shell": "/bin/bash",
    "run": "ls -la",
    "cwd": "/workspace/OpenAgent",
    "timeout_sec": 120
  }
}
```

- `message` is always required and conveys the natural-language summary to the user.
- `plan` is optional but, when present, must keep prior steps unless the user agrees to reset.
- `command` stays absent when no tool invocation is needed; when supplied, it must include the `shell`/`run` pair plus any optional execution hints (`cwd`, `timeout_sec`, filters).

If schema validation fails, the runtime pushes a corrective observation back to the model so it can retry with compliant JSON. The observation payload mirrors what `passExecutor` constructs:

```jsonc
{
  "observation_for_llm": {
    "schema_validation_error": true,
    "message": "Schema validation failed: /command.shell: is required",
    "details": ["/command.shell: is required"],
    "response_snippet": "{ \"message\": \"Missing shell\" }"
  },
  "observation_metadata": {
    "timestamp": "2024-05-13T17:45:00.000Z"
  }
}
```

The `message` summarizes the first schema error, while `details` enumerates each Ajv error string and `response_snippet` echoes part of the offending payload to provide debugging context.
