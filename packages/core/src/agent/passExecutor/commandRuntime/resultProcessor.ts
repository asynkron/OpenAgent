import { clonePlanForExecution } from '../planExecution.js';
import { deepCloneValue } from '../../../utils/planCloneUtils.js';
import type ObservationBuilder from '../../observationBuilder.js';
import type { ExecuteAgentPassOptions } from '../types.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { CommandExecutedResult, CommandContinueResult } from './types.js';
import type { RuntimeProperty, RuntimeDebugPayload } from '../../runtimeTypes.js';

export interface ResultProcessorOptions {
  readonly observationBuilder: ObservationBuilder;
  readonly planRuntime: PlanRuntime;
  readonly emitDebug: (payload: RuntimeDebugPayload) => void;
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
    await options.incrementCommandCountFn(
      deriveCommandKey(executed.command, executed.normalizedRun),
    );
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

  const sanitizedCommand = deepCloneValue(executed.command ?? null) as RuntimeProperty;
  const sanitizedResult = deepCloneValue(executed.result) as RuntimeProperty;
  const sanitizedExecution = deepCloneValue(executed.outcome.executionDetails) as RuntimeProperty;
  const sanitizedObservation = deepCloneValue(observation) as RuntimeProperty;
  const sanitizedPlanStep = executed.planStep
    ? ((clonePlanForExecution([executed.planStep])[0] ?? null) as RuntimeProperty)
    : null;

  options.emitDebug(() => ({
    stage: 'command-execution',
    command: sanitizedCommand,
    result: sanitizedResult,
    execution: sanitizedExecution,
    observation: sanitizedObservation,
  }));

  options.emitEvent?.({
    type: 'command-result',
    command: sanitizedCommand,
    result: sanitizedResult,
    preview: deepCloneValue(renderPayload) as RuntimeProperty,
    execution: sanitizedExecution,
    planStep: sanitizedPlanStep,
  });

  const snapshotEffect = options.planRuntime.emitPlanSnapshot();
  options.planRuntime.applyEffects([snapshotEffect]);

  return { type: 'continue' } satisfies CommandContinueResult;
};
