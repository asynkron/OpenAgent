/**
 * Handles structured edit commands emitted by the model.
 */
export default class EditCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return Boolean(context.command.edit);
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { command, cwd, runEditFn } = context;
    const result = await runEditFn(command.edit, cwd);

    return {
      result,
      executionDetails: { type: 'EDIT', spec: command.edit },
    };
  }
}
