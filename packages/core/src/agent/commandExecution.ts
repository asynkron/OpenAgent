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
import {
  DEFAULT_COMMAND_MAX_BYTES,
  DEFAULT_COMMAND_TAIL_LINES,
} from '../constants.js';
import ExecuteCommand from './commands/ExecuteCommand.js';
import type { CommandResult } from '../commands/run.js';
import type { CommandDraft, CommandExecutionDetails } from '../contracts/index.js';

const DEFAULT_TIMEOUT_SEC = 60 as const;

export type AgentCommand = CommandDraft;

export interface AgentCommandContext {
  command: AgentCommand;
  cwd: string;
  timeout: number;
  runCommandFn: (
    command: string,
    cwd: string,
    timeout: number,
    shell?: string,
  ) => Promise<CommandResult>;
}

export interface CommandExecutionResult {
  result: CommandResult;
  executionDetails: CommandExecutionDetails;
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

const normalizeCommand = (command: AgentCommand | null | undefined): AgentCommand => {
  if (!command || typeof command !== 'object') {
    return {
      reason: '',
      shell: '',
      run: '',
      cwd: '.',
      timeout_sec: DEFAULT_TIMEOUT_SEC,
      filter_regex: '',
      tail_lines: DEFAULT_COMMAND_TAIL_LINES,
      max_bytes: DEFAULT_COMMAND_MAX_BYTES,
    };
  }

  return {
    reason: typeof command.reason === 'string' ? command.reason : '',
    shell: typeof command.shell === 'string' ? command.shell : '',
    run: typeof command.run === 'string' ? command.run.trim() : '',
    cwd: typeof command.cwd === 'string' && command.cwd.trim() ? command.cwd : '.',
    timeout_sec:
      typeof command.timeout_sec === 'number' && Number.isFinite(command.timeout_sec)
        ? command.timeout_sec
        : DEFAULT_TIMEOUT_SEC,
    filter_regex: typeof command.filter_regex === 'string' ? command.filter_regex : '',
    tail_lines:
      typeof command.tail_lines === 'number' && Number.isFinite(command.tail_lines)
        ? command.tail_lines
        : DEFAULT_COMMAND_TAIL_LINES,
    max_bytes:
      typeof command.max_bytes === 'number' && Number.isFinite(command.max_bytes)
        ? command.max_bytes
        : DEFAULT_COMMAND_MAX_BYTES,
  };
};

function createCommandContext(
  normalizedCommand: AgentCommand,
  runCommandFn: AgentCommandContext['runCommandFn'],
): AgentCommandContext {
  const cwd = normalizedCommand.cwd || '.';
  const timeout =
    typeof normalizedCommand.timeout_sec === 'number'
      ? normalizedCommand.timeout_sec
      : DEFAULT_TIMEOUT_SEC;

  return {
    command: normalizedCommand,
    cwd,
    timeout,
    runCommandFn,
  };
}

function findMatchingHandler(context: AgentCommandContext): CommandHandler {
  const handlers = createCommandHandlers();

  for (const handler of handlers) {
    if (handler.isMatch(context)) {
      return handler;
    }
  }

  throw new Error('No matching command handler found.');
}

export async function executeAgentCommand({
  command,
  runCommandFn,
}: ExecuteAgentCommandOptions): Promise<CommandExecutionResult> {
  const normalizedCommand = normalizeCommand(command);
  const context = createCommandContext(normalizedCommand, runCommandFn);
  const handler = findMatchingHandler(context);

  return handler.execute(context);
}

export default {
  executeAgentCommand,
};
