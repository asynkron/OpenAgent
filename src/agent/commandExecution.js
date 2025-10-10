import { shellSplit } from '../utils/text.js';
import ExecuteCommand from './commands/ExecuteCommand.js';
import { normalizeReadCommand } from '../commands/read.js';

const DEFAULT_TIMEOUT_SEC = 60;

/**
 * @typedef {Object} AgentCommandContext
 * @property {object} command The raw command payload from the assistant.
 * @property {string} cwd Normalised working directory for the command.
 * @property {number} timeout Timeout to supply to shell commands.
 * @property {string[]} runTokens `command.run` (trimmed) tokenised via `shellSplit`.
 * @property {string} runKeyword Lower-cased first token from `runTokens`.
 * @property {(command: object, cwd: string, timeout: number, shell?: string) => Promise<object>} runCommandFn
 * @property {object|null} readSpec Parsed read specification when the command uses the read helper.
 */

/**
 * @typedef {Object} ICommand
 * @property {(context: AgentCommandContext) => boolean} isMatch Determine whether the handler should execute.
 * @property {(context: AgentCommandContext) => Promise<{ result: object, executionDetails: object }>} execute Execute the command when matched.
 */

/** @returns {ICommand[]} */
function createCommandHandlers() {
  return [new ExecuteCommand()];
}

export async function executeAgentCommand({ command, runCommandFn }) {
  const normalizedCommand = command || {};
  const cwd = normalizedCommand.cwd || '.';
  const timeout =
    typeof normalizedCommand.timeout_sec === 'number'
      ? normalizedCommand.timeout_sec
      : DEFAULT_TIMEOUT_SEC;
  const rawRun =
    typeof normalizedCommand.run === 'string' && normalizedCommand.run.trim()
      ? normalizedCommand.run.trim()
      : '';
  const runTokens = rawRun ? shellSplit(rawRun) : [];
  const runKeyword = runTokens[0]?.toLowerCase() || '';

  let readSpec = null;
  if (rawRun) {
    const normalization = normalizeReadCommand(rawRun, runTokens);
    normalizedCommand.run = normalization.command;
    readSpec = normalization.spec;
  } else {
    normalizedCommand.run = rawRun;
  }

  const handlers = createCommandHandlers();
  const context = {
    command: normalizedCommand,
    cwd,
    timeout,
    runTokens,
    runKeyword,
    runCommandFn,
    readSpec,
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
