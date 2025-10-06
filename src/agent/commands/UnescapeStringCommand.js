/**
 * Restores escaped strings back to their literal form.
 */
export default class UnescapeStringCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return Boolean(context.command.unescape_string);
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { command, cwd, runUnescapeStringFn } = context;
    const result = await runUnescapeStringFn(command.unescape_string, cwd);

    return {
      result,
      executionDetails: { type: 'UNESCAPE_STRING', spec: command.unescape_string },
    };
  }
}
