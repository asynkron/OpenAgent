import type { AgentCommandContext } from '../../commandExecution.js';
import type { CommandRunOutcome, EmitEvent } from '../types.js';
import type { CommandApproved, CommandExecution } from './types.js';

export interface SafeExecutionDependencies {
  executeAgentCommandFn: (input: {
    command: CommandApproved['command'];
    runCommandFn: AgentCommandContext['runCommandFn'];
  }) => Promise<CommandRunOutcome>;
  runCommandFn: AgentCommandContext['runCommandFn'];
  emitEvent: EmitEvent | null | undefined;
}

const buildFailureOutcome = (
  context: CommandApproved,
  error: unknown,
): CommandExecution => {
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));

  return {
    ...context,
    status: 'executed',
    outcome: {
      result: {
        stdout: '',
        stderr: normalizedError.message,
        exit_code: 1,
        killed: false,
        runtime_ms: 0,
      },
      executionDetails: {
        type: 'EXECUTE',
        command: context.command,
        error: {
          message: normalizedError.message,
          stack: normalizedError.stack,
        },
      },
    },
  } satisfies CommandExecution;
};

export const executeCommandSafely = async (
  dependencies: SafeExecutionDependencies,
  context: CommandApproved,
): Promise<CommandExecution> => {
  try {
    const outcome = await dependencies.executeAgentCommandFn({
      command: context.command,
      runCommandFn: dependencies.runCommandFn,
    });

    return {
      ...context,
      status: 'executed',
      outcome,
    } satisfies CommandExecution;
  } catch (error) {
    dependencies.emitEvent?.({
      type: 'status',
      level: 'error',
      message: 'Command execution threw an exception.',
      details: error instanceof Error ? error.stack || error.message : String(error),
    });

    return buildFailureOutcome(context, error);
  }
};
