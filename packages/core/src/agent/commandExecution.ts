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
import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';
import type { CommandResult, RunOptions } from '../commands/run.js';
import type { CommandRequest } from '../contracts/index.js';

const DEFAULT_TIMEOUT_SEC = 60 as const;

export interface AgentCommand extends Record<string, unknown> {
  run?: string;
  shell?: string;
  cwd?: string;
  timeout_sec?: number | null;
  filter_regex?: string;
  tail_lines?: number;
  max_bytes?: number;
  reason?: string;
}

export interface AgentCommandContext {
  command: AgentCommand;
  request: CommandRequest;
  runCommandFn: (command: CommandRequest, options?: RunOptions) => Promise<CommandResult>;
}

export interface CommandExecutionResult {
  result: CommandResult;
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

function normalizeCommand(command: AgentCommand | null | undefined): AgentCommand {
  const normalizedCommand: AgentCommand = command || {};
  const rawRun =
    typeof normalizedCommand.run === 'string' && normalizedCommand.run.trim()
      ? normalizedCommand.run.trim()
      : '';

  normalizedCommand.run = rawRun;
  return normalizedCommand;
}

const sanitizeNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const coerced = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (Number.isFinite(coerced)) {
    return coerced;
  }
  return fallback;
};

const sanitizeTimeout = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value === 0) {
    return 0;
  }
  return undefined;
};

const buildCommandRequest = (
  command: AgentCommand,
  cwd: string,
  timeout: number,
): CommandRequest => {
  const reason = typeof command.reason === 'string' ? command.reason.trim() : '';
  const shell = typeof command.shell === 'string' ? command.shell.trim() : '';
  const filterRegex = typeof command.filter_regex === 'string' ? command.filter_regex : '';
  const tailLines = sanitizeNumber(command.tail_lines, DEFAULT_COMMAND_TAIL_LINES);
  const maxBytes = sanitizeNumber(command.max_bytes, DEFAULT_COMMAND_MAX_BYTES);
  const timeoutOverride = sanitizeTimeout(command.timeout_sec);

  return {
    reason,
    shell: shell || undefined,
    run: command.run || '',
    cwd,
    limits: {
      timeoutSec: timeoutOverride ?? timeout,
      filterRegex,
      tailLines,
      maxBytes,
    },
  } satisfies CommandRequest;
};

function createCommandContext(
  normalizedCommand: AgentCommand,
  runCommandFn: AgentCommandContext['runCommandFn'],
): AgentCommandContext {
  const cwdCandidate = typeof normalizedCommand.cwd === 'string' ? normalizedCommand.cwd.trim() : '';
  const cwd = cwdCandidate || '.';
  const timeoutCandidate = sanitizeTimeout(normalizedCommand.timeout_sec);
  const timeout = timeoutCandidate ?? DEFAULT_TIMEOUT_SEC;
  const request = buildCommandRequest(normalizedCommand, cwd, timeout);

  return {
    command: normalizedCommand,
    request,
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
