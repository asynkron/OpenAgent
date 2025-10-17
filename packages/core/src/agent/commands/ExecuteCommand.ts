/**
 * Default command runner that shells out when no other handler matches.
 *
 * Consumers:
 * - Command execution dispatcher via `commandExecution.ts`.
 *
 * Note: The runtime still imports the compiled `commands/ExecuteCommand.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import type { AgentCommandContext, CommandExecutionResult } from '../commandExecution.js';

export default class ExecuteCommand {
  isMatch(_context: AgentCommandContext): boolean {
    return true;
  }

  async execute(context: AgentCommandContext): Promise<CommandExecutionResult> {
    const { command, request, runCommandFn } = context;
    const result = await runCommandFn(request);

    return {
      result,
      executionDetails: { type: 'EXECUTE', command },
    };
  }
}
