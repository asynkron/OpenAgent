/**
 * Shared command contracts consumed across the OpenAgent runtime.
 *
 * These interfaces describe both the raw assistant payload (draft) and the
 * normalized command shape the agent uses internally.
 */

/**
 * Raw command payload that the assistant submits through the tool schema.
 * Every field is optional because the model may omit values that the runtime
 * fills with defaults.
 */
export interface CommandDraft {
  reason?: string;
  shell?: string;
  run?: string;
  cwd?: string;
  timeout_sec?: number;
  filter_regex?: string;
  tail_lines?: number;
  max_bytes?: number;
}

/**
 * Normalized command after the runtime has applied defaults and trimming.
 */
export interface CommandDefinition {
  reason: string;
  shell: string;
  run: string;
  cwd: string;
  timeout_sec: number;
  filter_regex: string;
  tail_lines: number;
  max_bytes: number;
}

/**
 * Execution envelope that records how a command was run.
 */
export interface CommandExecutionDetails {
  type: string;
  command: CommandDraft;
  error?: {
    message: string;
    stack?: string | null;
  };
}
