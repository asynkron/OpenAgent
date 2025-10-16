import { clonePlanForExecution } from '../planExecution.js';
import type ObservationBuilder from '../../observationBuilder.js';
import type { ExecuteAgentPassOptions } from '../types.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { CommandExecutedResult, CommandContinueResult } from './types.js';

export interface ResultProcessorOptions {
  readonly observationBuilder: ObservationBuilder;
  readonly planRuntime: PlanRuntime;
  readonly emitDebug: (payload: unknown) => void;
  readonly emitEvent: ExecuteAgentPassOptions['emitEvent'];
  readonly incrementCommandCountFn: NonNullable<ExecuteAgentPassOptions['incrementCommandCountFn']>;
}

const deriveCommandKey = (
  commandPayload: CommandExecutedResult['command'],
  normalizedRun: string,
): string => {
  if (typeof commandPayload.key === 'string') {
    const trimmed = commandPayload.key.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (normalizedRun) {
    const [firstToken] = normalizedRun.split(/\s+/);
    if (firstToken) {
      return firstToken;
    }
  }

  return 'unknown';
};

const recordCommandStats = async (
  options: ResultProcessorOptions,
  executed: CommandExecutedResult,
): Promise<void> => {
  try {
    await options.incrementCommandCountFn(deriveCommandKey(executed.command, executed.normalizedRun));
  } catch (error) {
    options.emitEvent?.({
      type: 'status',
      level: 'warn',
      message: 'Failed to record command usage statistics.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

export const processCommandExecution = async (
  options: ResultProcessorOptions,
  executed: CommandExecutedResult,
): Promise<CommandContinueResult> => {
  await recordCommandStats(options, executed);

  const { renderPayload, observation } = options.observationBuilder.build({
    command: executed.command,
    result: executed.result,
  });

  options.planRuntime.applyCommandObservation({
    planStep: executed.planStep,
    observation,
    commandResult: executed.result,
  });

  options.emitDebug(() => ({
    stage: 'command-execution',
    command: executed.command,
    result: executed.outcome.result,
    execution: executed.outcome.executionDetails,
    observation,
  }));

  options.emitEvent?.({
    type: 'command-result',
    command: executed.command,
    result: executed.result,
    preview: renderPayload,
    execution: executed.outcome.executionDetails,
    planStep: executed.planStep ? (clonePlanForExecution([executed.planStep])[0] ?? null) : null,
  });

  const snapshotEffect = options.planRuntime.emitPlanSnapshot();
  options.planRuntime.applyEffects([snapshotEffect]);

  return { type: 'continue' } satisfies CommandContinueResult;
};
