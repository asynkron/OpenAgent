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
    const { command, cwd, timeout, runCommandFn, readSpec } = context;
    const result = await runCommandFn(command.run, cwd, timeout, command.shell);

    const executionDetails = readSpec
      ? { type: 'READ', spec: readSpec, command }
      : { type: 'EXECUTE', command };

    return {
      result,
      executionDetails,
    };
  }
}
