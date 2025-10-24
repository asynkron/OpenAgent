package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// CommandExecutor runs shell commands described by plan steps.
type CommandExecutor struct{}

// NewCommandExecutor builds the default executor that shells out using exec.CommandContext.
func NewCommandExecutor() *CommandExecutor {
	return &CommandExecutor{}
}

// Execute runs the provided command and returns stdout/stderr observations.
func (e *CommandExecutor) Execute(ctx context.Context, step PlanStep) (PlanObservationPayload, error) {
	if strings.TrimSpace(step.Command.Shell) == "" || strings.TrimSpace(step.Command.Run) == "" {
		return PlanObservationPayload{}, fmt.Errorf("command: invalid shell or run for step %s", step.ID)
	}
	cmd := exec.CommandContext(ctx, step.Command.Shell, "-c", step.Command.Run)
	if step.Command.Cwd != "" {
		cmd.Dir = step.Command.Cwd
	}

	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	timeout := time.Duration(step.Command.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = time.Minute
	}

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if err := cmd.Start(); err != nil {
		return PlanObservationPayload{}, fmt.Errorf("command: start: %w", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	var runErr error
	select {
	case <-runCtx.Done():
		_ = cmd.Process.Kill()
		runErr = fmt.Errorf("command: timeout after %s", timeout)
	case err := <-done:
		runErr = err
	}

	stdout := stdoutBuf.Bytes()
	stderr := stderrBuf.Bytes()

	filteredStdout := applyFilter(stdout, step.Command.FilterRegex)
	filteredStderr := applyFilter(stderr, step.Command.FilterRegex)

	truncatedStdout, truncated := truncateOutput(filteredStdout, step.Command.MaxBytes, step.Command.TailLines)
	truncatedStderr, stderrTruncated := truncateOutput(filteredStderr, step.Command.MaxBytes, step.Command.TailLines)
	truncated = truncated || stderrTruncated

	observation := PlanObservationPayload{
		Stdout:    string(truncatedStdout),
		Stderr:    string(truncatedStderr),
		Truncated: truncated,
		Plan:      nil,
	}

	if exitErr := (&exec.ExitError{}); errors.As(runErr, &exitErr) {
		code := exitErr.ExitCode()
		observation.ExitCode = &code
	} else if runErr == nil {
		zero := 0
		observation.ExitCode = &zero
	}

	if runErr != nil && !errors.As(runErr, &exec.ExitError{}) {
		observation.Details = runErr.Error()
	}

	return observation, runErr
}

func applyFilter(output []byte, pattern string) []byte {
	if pattern == "" {
		return output
	}
	rx, err := regexp.Compile(pattern)
	if err != nil {
		return output
	}
	lines := strings.Split(string(output), "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if rx.MatchString(line) {
			kept = append(kept, line)
		}
	}
	return []byte(strings.Join(kept, "\n"))
}

func truncateOutput(output []byte, maxBytes, tailLines int) ([]byte, bool) {
	if len(output) == 0 {
		return output, false
	}
	truncated := false
	if maxBytes > 0 && len(output) > maxBytes {
		output = output[len(output)-maxBytes:]
		truncated = true
	}

	if tailLines <= 0 {
		return output, truncated
	}

	lines := bytes.Split(output, []byte("\n"))
	if len(lines) > tailLines {
		lines = lines[len(lines)-tailLines:]
		truncated = true
	}

	return bytes.Join(lines, []byte("\n")), truncated
}

// BuildToolMessage marshals the observation into a JSON string ready for tool messages.
func BuildToolMessage(observation PlanObservationPayload) (string, error) {
	buf := bytes.Buffer{}
	encoder := jsonEncoder(&buf)
	if err := encoder.Encode(PlanObservation{ObservationForLLM: &observation}); err != nil {
		return "", err
	}
	result := strings.TrimSpace(buf.String())
	if result == "" {
		result = "{}"
	}
	return result, nil
}

// jsonEncoder wraps json.NewEncoder to delay importing encoding/json in callers without needing generics.
func jsonEncoder(w io.Writer) *json.Encoder {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	return enc
}
