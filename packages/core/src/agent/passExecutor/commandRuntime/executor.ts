import type { AgentCommandContext, VirtualCommandExecutor } from '../../commandExecution.js';
import type { ExecuteAgentPassOptions } from '../types.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { CommandRunOutcome } from '../types.js';
import type { ExecutableCandidate } from '../planRuntime.js';
import { type ApprovedCommand, type CommandExecutedResult, type PreparedCommand } from './types.js';

export interface CommandExecutorOptions {
  readonly executeAgentCommandFn: NonNullable<ExecuteAgentPassOptions['executeAgentCommandFn']>;
  readonly runCommandFn: AgentCommandContext['runCommandFn'];
  readonly emitEvent: ExecuteAgentPassOptions['emitEvent'];
  readonly planRuntime: PlanRuntime;
  readonly virtualCommandExecutor: VirtualCommandExecutor | null;
}

const executeCommandSafely = async (
  options: CommandExecutorOptions,
  commandPayload: ExecutableCandidate['command'],
): Promise<CommandRunOutcome> => {
  try {
    return await options.executeAgentCommandFn({
      command: commandPayload,
      runCommandFn: options.runCommandFn,
      virtualCommandExecutor: options.virtualCommandExecutor,
    });
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));

    options.emitEvent?.({
      type: 'status',
      payload: {
        level: 'error',
        message: 'Command execution threw an exception.',
        details: normalizedError.stack || normalizedError.message || null,
      },
      level: 'error',
      message: 'Command execution threw an exception.',
      details: normalizedError.stack || normalizedError.message || null,
    } as unknown as Parameters<NonNullable<typeof options.emitEvent>>[0]);

    return {
      result: {
        stdout: '',
        stderr: normalizedError.message,
        exit_code: 1,
        killed: false,
        runtime_ms: 0,
      },
      executionDetails: {
        type: 'EXECUTE',
        command: commandPayload,
        error: {
          message: normalizedError.message,
          stack: normalizedError.stack,
        },
      },
    } satisfies CommandRunOutcome;
  }
};

export const prepareCommandCandidate = (candidate: ExecutableCandidate): PreparedCommand => {
  const { step: planStepCandidate, command } = candidate;
  const planStep =
    planStepCandidate && typeof planStepCandidate === 'object' ? planStepCandidate : null;

  const normalizedRun = typeof command.run === 'string' ? command.run.trim() : '';
  if (normalizedRun && command.run !== normalizedRun) {
    command.run = normalizedRun;
  }

  return {
    type: 'prepared',
    command,
    planStep,
    normalizedRun,
  } satisfies PreparedCommand;
};

export const runApprovedCommand = async (
  options: CommandExecutorOptions,
  approved: ApprovedCommand,
): Promise<CommandExecutedResult> => {
  options.planRuntime.markCommandRunning(approved.planStep);
  const snapshotEffect = options.planRuntime.emitPlanSnapshot();
  options.planRuntime.applyEffects([snapshotEffect]);

  const outcome = await executeCommandSafely(options, approved.command);
  const { result } = outcome;

  return {
    ...approved,
    type: 'executed',
    outcome,
    result,
  } satisfies CommandExecutedResult;
};
