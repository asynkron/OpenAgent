export interface RunOptions {
  shell?: string | boolean;
  stdin?: string;
  closeStdin?: boolean;
  commandLabel?: string;
  description?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  killed: boolean;
  runtime_ms: number;
}

export type PartialCommandResult = Partial<CommandResult>;
