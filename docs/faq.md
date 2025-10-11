# Frequently Asked Questions

## How do I keep prompts in sync?

Run `npm run scripts:sync-prompts`, commit the updated prompt files, and confirm the changes with `git diff`. See [docs/prompt-maintenance.md](./prompt-maintenance.md) for the full workflow.

## Where do I document architectural changes?

Update the closest directory `context.md` and reflect the change in the [docs/docs-crosslinks.md](./docs-crosslinks.md) matrix. Major operational shifts also belong in [docs/ops-overview.md](./ops-overview.md).

## What tests must pass before merging?

- `npm run lint`
- `npm test`
- Schema validation (part of the test suite) whenever prompts, templates, or shortcuts change.

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
      "status": "completed",
      "observation": {
        "observation_for_llm": {
          "stdout": "On branch main\nnothing to commit, working tree clean",
          "exit_code": 0
        },
        "observation_metadata": {
          "timestamp": "2024-05-13T17:40:00.000Z"
        }
      }
    },
    {
      "step": "2",
      "title": "Sync with origin/main",
      "status": "running",
      "command": {
        "reason": "List repository contents so the user can inspect the workspace.",
        "shell": "/bin/bash",
        "run": "ls -la",
        "cwd": "/workspace/OpenAgent",
        "timeout_sec": 120
      }
    }
  ]
}
```

- `message` is always required and conveys the natural-language summary to the user.
- `plan` is optional but, when present, must keep prior steps unless the user agrees to reset.
- Every non-terminal plan step includes its `command` inline; the runtime refuses to execute until the plan provides the next command payload.
- `observation` captures the most recent command output for that plan step so the model can evaluate progress before updating statuses.

If schema validation fails, the runtime pushes a corrective observation back to the model so it can retry with compliant JSON. Observations are now serialized JSON blobs (as strings) instead of free-form prose:

```json
{
  "eventType": "chat-message",
  "role": "assistant",
  "pass": 8,
  "content": "{\"type\":\"observation\",\"summary\":\"The previous assistant response failed schema validation.\",\"details\":\"Schema validation failed: /plan/0/command/shell: is required\",\"payload\":{\"schema_validation_error\":true,\"message\":\"Schema validation failed: /plan/0/command/shell: is required\",\"details\":[\"/plan/0/command/shell: is required\"],\"response_snippet\":\"{ \\\"plan\\\": [ { \\\"step\\\": \\\"1\\\", \\\"title\\\": \\\"Check git status\\\", \\\"status\\\": \\\"running\\\", \\\"command\\\": { \\\"run\\\": \\\"ls\\\" } } ] }\"},\"metadata\":{\"timestamp\":\"2024-05-13T17:45:00.000Z\"}}"
}
```

The `summary`, `details`, `payload`, and `metadata` fields carry the information the model needs while keeping the transport fully machine-readable.
