package runtime

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

// RuntimeOptions control how the Go runtime mirrors the TypeScript agent loop.
type RuntimeOptions struct {
	APIKey                   string
	Model                    string
	SystemPrompt             string
	SystemPromptAugmentation string
	AutoApprove              bool
	NoHuman                  bool
	PlanReminderMessage      string
	NoHumanAutoMessage       string
	UserPrompt               string
	Input                    io.Reader
	Output                   io.Writer
	Clock                    func() time.Time
}

// Runtime orchestrates the conversation with OpenAI and shell command execution.
type Runtime struct {
	options      RuntimeOptions
	client       *OpenAIClient
	planManager  *PlanManager
	executor     *CommandExecutor
	history      []ChatMessage
	lastToolCall ToolCall
	reader       *bufio.Reader
	writer       io.Writer
}

// NewRuntime wires together the supporting services based on the provided options.
func NewRuntime(opts RuntimeOptions) (*Runtime, error) {
	options := opts
	if options.SystemPrompt == "" {
		options.SystemPrompt = "You are OpenAgent running inside a Go console application."
	}
	if options.PlanReminderMessage == "" {
		options.PlanReminderMessage = DefaultPlanReminder
	}
	if options.NoHumanAutoMessage == "" {
		options.NoHumanAutoMessage = DefaultNoHumanAutoMessage
	}
	if options.UserPrompt == "" {
		options.UserPrompt = "\n▷ "
	}
	if options.Input == nil {
		options.Input = os.Stdin
	}
	if options.Output == nil {
		options.Output = os.Stdout
	}
	if options.Clock == nil {
		options.Clock = time.Now
	}

	client, err := NewOpenAIClient(options.APIKey, options.Model)
	if err != nil {
		return nil, err
	}

	runtime := &Runtime{
		options:     options,
		client:      client,
		planManager: NewPlanManager(),
		executor:    NewCommandExecutor(),
		history:     make([]ChatMessage, 0, 32),
	}
	return runtime, nil
}

// Run starts the interactive loop until EOF or an explicit exit command.
func (rt *Runtime) Run(ctx context.Context) error {
	rt.reader = bufio.NewReader(rt.options.Input)
	rt.writer = rt.options.Output

	systemPrompt := rt.options.SystemPrompt
	if rt.options.SystemPromptAugmentation != "" {
		systemPrompt = systemPrompt + "\n\n" + rt.options.SystemPromptAugmentation
	}
	rt.appendMessage(ChatMessage{Role: RoleSystem, Content: systemPrompt})

	fmt.Fprintln(rt.writer, "OpenAgent Go runtime ready. Type /exit to quit, /plan to inspect the current plan.")

	for {
		executed, err := rt.executePlanIfReady(ctx)
		if err != nil {
			return err
		}
		if executed {
			continue
		}

		if rt.options.NoHuman {
			message := rt.options.NoHumanAutoMessage
			if rt.planManager.HasPending() {
				message = rt.options.PlanReminderMessage
			}
			if last := rt.lastUserMessage(); last != nil && last.Content == message {
				message = ""
			}
			if err := rt.queryAssistant(ctx, message); err != nil {
				return err
			}
			continue
		}

		fmt.Fprint(rt.writer, rt.options.UserPrompt)
		line, err := rt.reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				fmt.Fprintln(rt.writer, "\nGoodbye.")
				return nil
			}
			return fmt.Errorf("runtime: read input: %w", err)
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.EqualFold(line, "/exit") {
			fmt.Fprintln(rt.writer, "Exiting on request.")
			return nil
		}
		if strings.EqualFold(line, "/plan") {
			rt.printPlan()
			continue
		}
		if strings.EqualFold(line, "/auto") {
			rt.options.AutoApprove = !rt.options.AutoApprove
			state := "disabled"
			if rt.options.AutoApprove {
				state = "enabled"
			}
			fmt.Fprintf(rt.writer, "Auto-approve %s.\n", state)
			continue
		}

		rt.appendMessage(ChatMessage{Role: RoleUser, Content: line})
		if err := rt.queryAssistant(ctx, ""); err != nil {
			return err
		}
	}
}

func (rt *Runtime) executePlanIfReady(ctx context.Context) (bool, error) {
	step, ok := rt.planManager.Ready()
	if !ok {
		return false, nil
	}

	if !rt.options.AutoApprove && !rt.options.NoHuman {
		fmt.Fprintf(rt.writer, "\nPlan step %s is ready:\n  %s\n  Command: %s\nExecute? [y/N]: ", step.ID, step.Title, step.Command.Run)
		answer, err := rt.reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				return false, err
			}
			return false, fmt.Errorf("runtime: read approval: %w", err)
		}
		answer = strings.TrimSpace(strings.ToLower(answer))
		if answer != "y" && answer != "yes" {
			fmt.Fprintf(rt.writer, "Skipped plan step %s.\n", step.ID)
			return true, nil
		}
	} else if !rt.options.AutoApprove && rt.options.NoHuman {
		fmt.Fprintf(rt.writer, "\nNo human available to approve step %s. Requesting updated plan.\n", step.ID)
		if err := rt.queryAssistant(ctx, rt.options.PlanReminderMessage); err != nil {
			return true, err
		}
		return true, nil
	}

	fmt.Fprintf(rt.writer, "\nExecuting plan step %s: %s\nCommand: %s\n", step.ID, step.Title, step.Command.Run)
	observation, err := rt.executor.Execute(ctx, step)
	status := PlanCompleted
	if err != nil {
		status = PlanFailed
		fmt.Fprintf(rt.writer, "Command error: %v\n", err)
	} else {
		fmt.Fprintln(rt.writer, "Command completed successfully.")
	}

	if updateErr := rt.planManager.UpdateStatus(step.ID, status, &PlanObservation{ObservationForLLM: &observation}); updateErr != nil {
		return true, updateErr
	}

	if rt.lastToolCall.ID != "" {
		payload, encodeErr := BuildToolMessage(observation)
		if encodeErr == nil {
			rt.appendMessage(ChatMessage{
				Role:       RoleTool,
				Content:    payload,
				ToolCallID: rt.lastToolCall.ID,
			})
		} else {
			summary := rt.summarizeObservation(step.ID, observation, encodeErr)
			rt.appendMessage(ChatMessage{Role: RoleUser, Content: summary})
		}
	} else {
		summary := rt.summarizeObservation(step.ID, observation, nil)
		rt.appendMessage(ChatMessage{Role: RoleUser, Content: summary})
	}

	if err := rt.queryAssistant(ctx, ""); err != nil {
		return true, err
	}

	return true, nil
}

func (rt *Runtime) queryAssistant(ctx context.Context, userMessage string) error {
	if userMessage != "" {
		rt.appendMessage(ChatMessage{Role: RoleUser, Content: userMessage})
	}
	plan, toolCall, err := rt.client.RequestPlan(ctx, rt.history)
	if err != nil {
		return err
	}
	rt.lastToolCall = toolCall
	rt.appendMessage(ChatMessage{
		Role:      RoleAssistant,
		Content:   plan.Message,
		ToolCalls: []ToolCall{toolCall},
	})
	rt.planManager.Replace(plan.Plan)

	fmt.Fprintf(rt.writer, "\nAssistant:\n%s\n", plan.Message)
	if len(plan.Plan) > 0 {
		fmt.Fprintln(rt.writer, "Current plan:")
		for _, step := range plan.Plan {
			fmt.Fprintf(rt.writer, "  [%s] %-9s %s\n", step.ID, step.Status, step.Title)
		}
	} else {
		fmt.Fprintln(rt.writer, "Plan is empty.")
	}
	return nil
}

func (rt *Runtime) summarizeObservation(id string, obs PlanObservationPayload, encodeErr error) string {
	summary := map[string]any{
		"step":      id,
		"stdout":    obs.Stdout,
		"stderr":    obs.Stderr,
		"truncated": obs.Truncated,
	}
	if obs.ExitCode != nil {
		summary["exit_code"] = *obs.ExitCode
	}
	if encodeErr != nil {
		summary["encoding_error"] = encodeErr.Error()
	}
	data, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		return fmt.Sprintf("step %s observation: exit=%v", id, obs.ExitCode)
	}
	return string(data)
}

func (rt *Runtime) printPlan() {
	snapshot := rt.planManager.SortOrder()
	if len(snapshot) == 0 {
		fmt.Fprintln(rt.writer, "No plan available.")
		return
	}
	fmt.Fprintln(rt.writer, "Plan snapshot:")
	for _, step := range snapshot {
		fmt.Fprintf(rt.writer, "  [%s] %-9s %s\n", step.ID, step.Status, step.Title)
	}
}

func (rt *Runtime) appendMessage(msg ChatMessage) {
	if msg.Timestamp.IsZero() {
		msg.Timestamp = rt.options.Clock()
	}
	rt.history = append(rt.history, msg)
}

func (rt *Runtime) lastUserMessage() *ChatMessage {
	for i := len(rt.history) - 1; i >= 0; i-- {
		if rt.history[i].Role == RoleUser {
			return &rt.history[i]
		}
	}
	return nil
}
