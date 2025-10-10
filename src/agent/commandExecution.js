import ExecuteCommand from './commands/ExecuteCommand.js';

const DEFAULT_TIMEOUT_SEC = 60;

/**
 * @typedef {Object} AgentCommandContext
 * @property {object} command The raw command payload from the assistant.
 * @property {string} cwd Normalised working directory for the command.
 * @property {number} timeout Timeout to supply to shell commands.
 * @property {(command: object, cwd: string, timeout: number, shell?: string) => Promise<object>} runCommandFn
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

  normalizedCommand.run = rawRun;

  const handlers = createCommandHandlers();
  const context = {
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
