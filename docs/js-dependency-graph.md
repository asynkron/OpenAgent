# JavaScript Dependency Graph

This diagram shows which JavaScript files within the OpenAgent ESM implementation import other files (relative import paths only).

```mermaid
graph LR
  index_js["index.js"] --> src_agent_loop_js["src/agent/loop.js"]
  index_js --> src_cli_io_js["src/cli/io.js"]
  index_js --> src_cli_render_js["src/cli/render.js"]
  index_js --> src_cli_thinking_js["src/cli/thinking.js"]
  index_js --> src_commands_commandStats_js["src/commands/commandStats.js"]
  index_js --> src_commands_preapproval_js["src/commands/preapproval.js"]
  index_js --> src_commands_run_js["src/commands/run.js"]
  index_js --> src_config_systemPrompt_js["src/config/systemPrompt.js"]
  index_js --> src_openai_client_js["src/openai/client.js"]
  index_js --> src_utils_text_js["src/utils/text.js"]
  src_agent_loop_js --> src_cli_io_js
  src_agent_loop_js --> src_cli_render_js
  src_agent_loop_js --> src_cli_thinking_js
  src_agent_loop_js --> src_commands_commandStats_js
  src_agent_loop_js --> src_commands_preapproval_js
  src_agent_loop_js --> src_commands_run_js
  src_agent_loop_js --> src_config_systemPrompt_js
  src_agent_loop_js --> src_openai_client_js
  src_agent_loop_js --> src_utils_cancellation_js["src/utils/cancellation.js"]
  src_agent_loop_js --> src_utils_output_js["src/utils/output.js"]
  src_agent_loop_js --> src_utils_text_js
  src_cli_io_js --> src_utils_cancellation_js
  src_commands_preapproval_js --> src_utils_text_js
  src_commands_run_js --> src_utils_cancellation_js
```

_Generated via automated AST analysis using Acorn on the current workspace state._
