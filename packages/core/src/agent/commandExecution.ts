// @ts-nocheck
/**
 * Command dispatcher used by the agent runtime.
 *
 * Responsibilities:
 * - Normalize the assistant-provided command payload.
 * - Select an execution strategy and invoke the injected shell runner.
 *
 * Consumers:
 * - Agent pass executor prior to running commands.
 *
 * Note: The runtime still imports the compiled `commandExecution.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import ExecuteCommand from './commands/ExecuteCommand.js';

const DEFAULT_TIMEOUT_SEC = 60 as const;

export interface AgentCommand extends Record<string, unknown> {
  run?: string;
  shell?: string;
  cwd?: string;
  timeout_sec?: number;
}

export interface AgentCommandContext {
  command: AgentCommand;
  cwd: string;
  timeout: number;
  runCommandFn: (
    command: string,
    cwd: string,
    timeout: number,
    shell?: string,
  ) => Promise<Record<string, unknown>>;
}

export interface CommandExecutionResult {
  result: Record<string, unknown>;
  executionDetails: Record<string, unknown>;
}

export interface CommandHandler {
  isMatch(context: AgentCommandContext): boolean;
  execute(context: AgentCommandContext): Promise<CommandExecutionResult>;
}

function createCommandHandlers(): CommandHandler[] {
  return [new ExecuteCommand()];
}

export interface ExecuteAgentCommandOptions {
  command?: AgentCommand | null;
  runCommandFn: AgentCommandContext['runCommandFn'];
}

export async function executeAgentCommand({
  command,
  runCommandFn,
}: ExecuteAgentCommandOptions): Promise<CommandExecutionResult> {
  const normalizedCommand: AgentCommand = command || {};
  const cwd = normalizedCommand.cwd || '.';
  const timeout =
    typeof normalizedCommand.timeout_sec === 'number'
      ? normalizedCommand.timeout_sec
      : DEFAULT_TIMEOUT_SEC;
  const rawRun =
    typeof normalizedCommand.run === 'string' && normalizedCommand.run.trim()
      ? normalizedCommand.run.trim()
      : '';

  normalizedCommand.run = rawRun;

  const handlers = createCommandHandlers();
  const context: AgentCommandContext = {
    command: normalizedCommand,
    cwd,
    timeout,
    runCommandFn,
  };

  for (const handler of handlers) {
    if (handler.isMatch(context)) {
      return handler.execute(context);
    }
  }

  throw new Error('No matching command handler found.');
}

export default {
  executeAgentCommand,
};
