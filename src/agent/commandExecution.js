import { shellSplit } from '../utils/text.js';
import BrowseCommand from './commands/BrowseCommand.js';
import EditCommand from './commands/EditCommand.js';
import EscapeStringCommand from './commands/EscapeStringCommand.js';
import ExecuteCommand from './commands/ExecuteCommand.js';
import ReadCommand from './commands/ReadCommand.js';
import ReplaceCommand from './commands/ReplaceCommand.js';
import UnescapeStringCommand from './commands/UnescapeStringCommand.js';

const DEFAULT_TIMEOUT_SEC = 60;

/**
 * @typedef {Object} AgentCommandContext
 * @property {object} command The raw command payload from the assistant.
 * @property {string} cwd Normalised working directory for the command.
 * @property {number} timeout Timeout to supply to shell/browse commands.
 * @property {string[]} runTokens `command.run` (trimmed) tokenised via `shellSplit`.
 * @property {string} runKeyword Lower-cased first token from `runTokens`.
 * @property {(command: object, cwd: string, timeout: number, shell?: string) => Promise<object>} runCommandFn
 * @property {(target: string, timeout: number) => Promise<object>} runBrowseFn
 * @property {(spec: object, cwd: string) => Promise<object>} runEditFn
 * @property {(spec: object, cwd: string) => Promise<object>} runReadFn
 * @property {(spec: object, cwd: string) => Promise<object>} runReplaceFn
 * @property {(spec: object, cwd: string) => Promise<object>} runEscapeStringFn
 * @property {(spec: object, cwd: string) => Promise<object>} runUnescapeStringFn
 */

/**
 * @typedef {Object} ICommand
 * @property {(context: AgentCommandContext) => boolean} isMatch Determine whether the handler should execute.
 * @property {(context: AgentCommandContext) => Promise<{ result: object, executionDetails: object }>} execute Execute the command when matched.
 */

/** @returns {ICommand[]} */
function createCommandHandlers() {
  return [
    new EditCommand(),
    new EscapeStringCommand(),
    new UnescapeStringCommand(),
    new ReplaceCommand(),
    new BrowseCommand(),
    new ReadCommand(),
    new ExecuteCommand(),
  ];
}

export async function executeAgentCommand({
  command,
  runCommandFn,
  runBrowseFn,
  runEditFn,
  runReadFn,
  runReplaceFn,
  runEscapeStringFn,
  runUnescapeStringFn,
}) {
  const normalizedCommand = command || {};
  const cwd = normalizedCommand.cwd || '.';
  const timeout =
    typeof normalizedCommand.timeout_sec === 'number'
      ? normalizedCommand.timeout_sec
      : DEFAULT_TIMEOUT_SEC;
  const runTokens =
    typeof normalizedCommand.run === 'string' && normalizedCommand.run.trim()
      ? shellSplit(normalizedCommand.run.trim())
      : [];
  const runKeyword = runTokens[0]?.toLowerCase() || '';

  const handlers = createCommandHandlers();
  const context = {
    command: normalizedCommand,
    cwd,
    timeout,
    runTokens,
    runKeyword,
    runCommandFn,
    runBrowseFn,
    runEditFn,
    runReadFn,
    runReplaceFn,
    runEscapeStringFn,
    runUnescapeStringFn,
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
