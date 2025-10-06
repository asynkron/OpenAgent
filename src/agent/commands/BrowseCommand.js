/**
 * Opens URLs through the browsing subsystem.
 */
export default class BrowseCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return context.runKeyword === 'browse';
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { runTokens, timeout, runBrowseFn } = context;
    const target = runTokens.slice(1).join(' ').trim();

    if (!target) {
      return {
        result: this.buildErrorResult('browse command requires a URL argument'),
        executionDetails: { type: 'BROWSE', target: '' },
      };
    }

    const result = await runBrowseFn(target, timeout);
    return { result, executionDetails: { type: 'BROWSE', target } };
  }

  buildErrorResult(message) {
    return {
      stdout: '',
      stderr: message,
      exit_code: 1,
      killed: false,
      runtime_ms: 0,
    };
  }
}
