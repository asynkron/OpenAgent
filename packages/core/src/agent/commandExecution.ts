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
import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';
import { createEscWaiter, resetEscState, setEscActivePromise, clearEscActivePromise, type EscState } from './escState.js';
import { register as registerCancellation } from '../utils/cancellation.js';
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

export interface VirtualCommandDescriptor {
  readonly action: string;
  readonly argument: string;
}

export interface VirtualCommandExecutionContext {
  readonly command: AgentCommand;
  readonly descriptor: VirtualCommandDescriptor;
}

export type VirtualCommandExecutor = (context: VirtualCommandExecutionContext) => Promise<CommandExecutionResult>;

function createCommandHandlers(): CommandHandler[] {
  return [new ExecuteCommand()];
}

export interface ExecuteAgentCommandOptions {
  command?: AgentCommand | null;
  runCommandFn: AgentCommandContext['runCommandFn'];
  virtualCommandExecutor?: VirtualCommandExecutor | null;
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

const VIRTUAL_COMMAND_SHELL = 'openagent';
const VIRTUAL_COMMAND_PREFIX = 'virtual-agent';

const detectVirtualCommand = (command: AgentCommand): VirtualCommandDescriptor | null => {
  if (command.shell !== VIRTUAL_COMMAND_SHELL) {
    return null;
  }

  const trimmedRun = typeof command.run === 'string' ? command.run.trim() : '';
  if (!trimmedRun.startsWith(VIRTUAL_COMMAND_PREFIX)) {
    return null;
  }

  const remainder = trimmedRun.slice(VIRTUAL_COMMAND_PREFIX.length).trim();
  if (!remainder) {
    return { action: 'default', argument: '' };
  }

  const spaceIndex = remainder.indexOf(' ');
  if (spaceIndex === -1) {
    return { action: remainder, argument: '' };
  }

  const action = remainder.slice(0, spaceIndex).trim();
  const argument = remainder.slice(spaceIndex + 1).trim();

  return {
    action: action || 'default',
    argument,
  };
};

const MAX_VIRTUAL_ARGUMENT_PREVIEW = 200;

const formatVirtualCommandDetail = (descriptor: VirtualCommandDescriptor): string => {
  const actionLabel = descriptor.action ? `action "${descriptor.action}"` : 'virtual action';
  if (!descriptor.argument) {
    return actionLabel;
  }

  const argument = descriptor.argument.length > MAX_VIRTUAL_ARGUMENT_PREVIEW
    ? `${descriptor.argument.slice(0, MAX_VIRTUAL_ARGUMENT_PREVIEW)}…`
    : descriptor.argument;

  return `${actionLabel} with argument: ${argument}`;
};

const buildVirtualCommandFallback = (
  command: AgentCommand,
  descriptor: VirtualCommandDescriptor,
  reason: string,
): CommandExecutionResult => {
  const message = `${reason} (${formatVirtualCommandDetail(descriptor)}). Provide a virtualCommandExecutor to handle this command.`;

  return {
    result: {
      stdout: '',
      stderr: message,
      exit_code: 1,
      killed: false,
      runtime_ms: 0,
    },
    executionDetails: {
      type: 'VIRTUAL',
      command,
      error: {
        message,
      },
    },
  };
};

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
  virtualCommandExecutor,
}: ExecuteAgentCommandOptions): Promise<CommandExecutionResult> {
  const normalizedCommand = normalizeCommand(command);
  const virtualDescriptor = detectVirtualCommand(normalizedCommand);

  if (virtualDescriptor) {
    if (typeof virtualCommandExecutor === 'function') {
      return virtualCommandExecutor({ command: normalizedCommand, descriptor: virtualDescriptor });
    }

    return buildVirtualCommandFallback(
      normalizedCommand,
      virtualDescriptor,
      'Virtual command requested but no virtualCommandExecutor is configured.',
    );
  }

  const context = createCommandContext(normalizedCommand, runCommandFn);
  const handler = findMatchingHandler(context);

  return handler.execute(context);
}

export default {
  executeAgentCommand,
};
