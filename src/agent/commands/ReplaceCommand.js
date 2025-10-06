/**
 * Applies structured replacements across files.
 */
export default class ReplaceCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return Boolean(context.command.replace);
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { command, cwd, runReplaceFn } = context;
    const result = await runReplaceFn(command.replace, cwd);

    return {
      result,
      executionDetails: { type: 'REPLACE', spec: command.replace },
    };
  }
}
