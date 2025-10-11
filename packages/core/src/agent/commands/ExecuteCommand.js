/**
 * Default command runner that shells out when no other handler matches.
 */
export default class ExecuteCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} _context */
  isMatch(_context) {
    return true;
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { command, cwd, timeout, runCommandFn } = context;
    const result = await runCommandFn(command.run, cwd, timeout, command.shell);

    return {
      result,
      executionDetails: { type: 'EXECUTE', command },
    };
  }
}
