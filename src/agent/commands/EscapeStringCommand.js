/**
 * Escapes strings via the dedicated helper to avoid shell quoting mistakes.
 */
export default class EscapeStringCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return Boolean(context.command.escape_string);
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { command, cwd, runEscapeStringFn } = context;
    const result = await runEscapeStringFn(command.escape_string, cwd);

    return {
      result,
      executionDetails: { type: 'ESCAPE_STRING', spec: command.escape_string },
    };
  }
}
