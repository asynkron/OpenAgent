# JavaScript Dependency Graph

This diagram shows how the top-level CLI entry composes the core runtime after the workspace split (relative import paths).

```mermaid
graph LR
  root_index["index.js"] --> cli_index["packages/cli/index.js"]
  cli_index --> cli_thinking["packages/cli/src/thinking.js"]
  cli_index --> cli_io["packages/cli/src/io.js"]
  cli_index --> cli_render["packages/cli/src/render.js"]
  cli_index --> cli_status["packages/cli/src/status.js"]
  cli_index --> cli_runtime["packages/cli/src/runtime.js"]
  cli_index --> core_index["packages/core/index.ts"]
  cli_runtime --> core_index
  cli_runner["packages/cli/src/runner.js"] --> cli_runtime
  cli_runner --> core_index
  cli_io --> core_index
  core_index --> core_agent_loop["packages/core/src/agent/loop.ts"]
  core_index --> core_commands_run["packages/core/src/commands/run.ts"]
  core_index --> core_services_approval["packages/core/src/services/commandApprovalService.ts"]
  core_index --> core_services_stats["packages/core/src/services/commandStatsService.ts"]
  core_index --> core_utils_cancellation["packages/core/src/utils/cancellation.ts"]
  core_index --> core_utils_text["packages/core/src/utils/text.ts"]
  core_index --> core_openai_client["packages/core/src/openai/client.ts"]
  core_index --> core_config_prompt["packages/core/src/config/systemPrompt.ts"]
```

_Updated after migrating to the `packages/core` + `packages/cli` workspace layout._
