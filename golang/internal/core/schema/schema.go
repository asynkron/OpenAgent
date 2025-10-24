package schema

import (
	"encoding/json"
	"fmt"
)

// ToolName is the canonical identifier shared with the assistant runtime.
const ToolName = "open-agent"

// toolDescription mirrors the TypeScript tool description so prompts stay aligned.
const toolDescription = "Return the response envelope that matches the OpenAgent protocol (message, plan, and command fields)."

// planResponseSchemaJSON copies the Draft-07 JSON schema used by the TypeScript runtime.
// The schema is stored as raw JSON so we can provide it to OpenAI without translation losses.
const planResponseSchemaJSON = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["message", "plan"],
  "properties": {
    "message": {
      "type": "string",
      "description": "Markdown formatted message to the user."
    },
    "plan": {
      "type": "array",
      "description": "a DAG (Directed Acyclic Graph) of tasks to execute, each task executes exactly 1 command, each task can depend on 0 or more other tasks to complete before executing. User goals should be the last task to execute in the chain of task. e.g 'I want to create a guess a number game in js', then 'game created' is the end node in the graph. The DAG is designed to do groundwork first, creating files, install packages etc. and to validate, run tests etc as end nodes.",
      "items": {
        "type": "object",
        "description": "a single task in the DAG plan, represents both the task and the shell command to execute",
        "additionalProperties": false,
        "required": ["id", "title", "status", "waitingForId", "command"],
        "properties": {
          "id": {
            "type": "string",
            "description": "Random ID assigned by AI."
          },
          "title": {
            "type": "string",
            "description": "Human readable summary of the plan step."
          },
          "status": {
            "type": "string",
            "enum": ["pending", "completed", "failed", "abandoned"],
            "description": "Current execution status for the plan step. \"failed\" tasks, should be \"abandoned\" by the Assistant other plan steps that are waiting for a failed or abandoned step. should now replace that 'id' in their waitingForId array. e.g. A is waiting for B, B fails, B should now be abandoned, A should now wait for new task C, where C now can perform another command and try something else to not fail."
          },
          "waitingForId": {
            "type": "array",
            "items": { "type": "string" },
            "default": [],
            "description": "IDs this task has to wait for before it can be executed (dependencies)."
          },
          "command": {
            "type": "object",
            "additionalProperties": false,
            "description": "Next tool invocation to execute for this plan step. This command should complete the task if successful.",
            "required": [
              "reason",
              "shell",
              "run",
              "cwd",
              "timeout_sec",
              "filter_regex",
              "tail_lines",
              "max_bytes"
            ],
            "properties": {
              "reason": {
                "type": "string",
                "default": "",
                "description": "Explain why this shell command is required for the plan step. If only shell or run is provided, justify the omission."
              },
              "shell": {
                "type": "string",
                "description": "Shell executable to launch when running commands. May only contain value if \"run\" contains an actual command to run."
              },
              "run": {
                "type": "string",
                "description": "Command string to execute in the provided shell. Must be set if \"shell\" has a value; may NOT be set if \"shell\" has no value."
              },
              "cwd": {
                "type": "string",
                "default": "",
                "description": "Working directory for shell execution."
              },
              "timeout_sec": {
                "type": "integer",
                "minimum": 1,
                "default": 60,
                "description": "Timeout guard for long-running commands (seconds)."
              },
              "filter_regex": {
                "type": "string",
                "default": "",
                "description": "Regex used to filter command output (empty for none)."
              },
              "tail_lines": {
                "type": "integer",
                "minimum": 0,
                "default": 200,
                "description": "Number of trailing lines to return from output (0 disables the limit)."
              },
              "max_bytes": {
                "type": "integer",
                "minimum": 1,
                "default": 16384,
                "description": "Maximum number of bytes to include from stdout/stderr (defaults to ~200 lines at 16 KiB)."
              }
            }
          }
        }
      }
    }
  }
}`

// PlanResponseSchema returns the parsed JSON schema so callers can embed it in OpenAI requests.
func PlanResponseSchema() (map[string]any, error) {
	var value map[string]any
	if err := json.Unmarshal([]byte(planResponseSchemaJSON), &value); err != nil {
		return nil, fmt.Errorf("schema: decode plan schema: %w", err)
	}
	return value, nil
}

// ToolDefinition describes the single structured tool exposed to the model.
type ToolDefinition struct {
	Name        string
	Description string
	Parameters  map[string]any
}

// Definition returns the canonical tool metadata used across the runtime.
func Definition() (ToolDefinition, error) {
	schema, err := PlanResponseSchema()
	if err != nil {
		return ToolDefinition{}, err
	}
	return ToolDefinition{
		Name:        ToolName,
		Description: toolDescription,
		Parameters:  schema,
	}, nil
}
