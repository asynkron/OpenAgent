import { parseReadSpecTokens, mergeReadSpecs } from '../../commands/readSpec.js';

/**
 * Reads file content based on structured specs or inline tokens.
 */
export default class ReadCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return context.runKeyword === 'read' || Boolean(context.command.read);
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { runKeyword, runTokens, command, cwd, runReadFn } = context;
    const tokenSpec = runKeyword === 'read' ? parseReadSpecTokens(runTokens.slice(1)) : {};
    const baseSpec =
      command.read && typeof command.read === 'object'
        ? command.read
        : {};

    const mergedSpec = mergeReadSpecs(baseSpec, tokenSpec);
    if (!mergedSpec.path) {
      return {
        result: this.#buildErrorResult('read command requires a path argument'),
        executionDetails: { type: 'READ', spec: mergedSpec },
      };
    }

    const result = await runReadFn(mergedSpec, cwd);
    return {
      result,
      executionDetails: { type: 'READ', spec: mergedSpec },
    };
  }

  #buildErrorResult(message) {
    return {
      stdout: '',
      stderr: message,
      exit_code: 1,
      killed: false,
      runtime_ms: 0,
    };
  }
}
