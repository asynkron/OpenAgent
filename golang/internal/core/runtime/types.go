package runtime

import "time"

// MessageRole enumerates the chat roles supported by the runtime.
type MessageRole string

const (
	RoleSystem    MessageRole = "system"
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
	RoleTool      MessageRole = "tool"
)

// ChatMessage stores a single message exchanged with OpenAI.
type ChatMessage struct {
	Role       MessageRole
	Content    string
	ToolCallID string
	Name       string
	Timestamp  time.Time
	ToolCalls  []ToolCall
}

// ToolCall stores metadata for an assistant tool invocation.
type ToolCall struct {
	ID        string
	Name      string
	Arguments string
}

// CommandDraft replicates the shell command contract embedded in the plan schema.
type CommandDraft struct {
	Reason      string `json:"reason"`
	Shell       string `json:"shell"`
	Run         string `json:"run"`
	Cwd         string `json:"cwd"`
	TimeoutSec  int    `json:"timeout_sec"`
	FilterRegex string `json:"filter_regex"`
	TailLines   int    `json:"tail_lines"`
	MaxBytes    int    `json:"max_bytes"`
}

// PlanStatus represents execution status for a plan step.
type PlanStatus string

const (
	PlanPending   PlanStatus = "pending"
	PlanCompleted PlanStatus = "completed"
	PlanFailed    PlanStatus = "failed"
	PlanAbandoned PlanStatus = "abandoned"
)

// PlanObservationPayload mirrors the JSON payload forwarded back to the model.
type PlanObservationPayload struct {
	Plan                    []PlanStep `json:"plan,omitempty"`
	Stdout                  string     `json:"stdout,omitempty"`
	Stderr                  string     `json:"stderr,omitempty"`
	Truncated               bool       `json:"truncated,omitempty"`
	ExitCode                *int       `json:"exit_code,omitempty"`
	JSONParseError          bool       `json:"json_parse_error,omitempty"`
	SchemaValidationError   bool       `json:"schema_validation_error,omitempty"`
	ResponseValidationError bool       `json:"response_validation_error,omitempty"`
	CanceledByHuman         bool       `json:"canceled_by_human,omitempty"`
	OperationCanceled       bool       `json:"operation_canceled,omitempty"`
	Summary                 string     `json:"summary,omitempty"`
	Details                 string     `json:"details,omitempty"`
}

// PlanObservation bundles the payload with optional metadata.
type PlanObservation struct {
	ObservationForLLM *PlanObservationPayload `json:"observation_for_llm,omitempty"`
}

// PlanStep describes an individual plan entry from OpenAI.
type PlanStep struct {
	ID           string           `json:"id"`
	Title        string           `json:"title"`
	Status       PlanStatus       `json:"status"`
	WaitingForID []string         `json:"waitingForId"`
	Command      CommandDraft     `json:"command"`
	Observation  *PlanObservation `json:"observation,omitempty"`
}

// PlanResponse captures the structured assistant output.
type PlanResponse struct {
	Message string     `json:"message"`
	Plan    []PlanStep `json:"plan"`
}
