import type ObservationBuilder from '../../observationBuilder.js';
import { clonePlanForExecution } from '../planExecution.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { EmitEvent } from '../types.js';
import type { CommandExecution, CommandResultEmission } from './types.js';

export interface ResultEmitterDependencies {
  observationBuilder: ObservationBuilder;
  planRuntime: PlanRuntime;
  emitEvent: EmitEvent | null | undefined;
  emitDebug: (payload: unknown) => void;
}

export const emitCommandResult = (
  dependencies: ResultEmitterDependencies,
  context: CommandExecution,
): CommandResultEmission => {
  const commandResult = context.outcome.result as CommandResultEmission['commandResult'];
  const { renderPayload, observation } = dependencies.observationBuilder.build({
    command: context.command,
    result: commandResult,
  });

  dependencies.planRuntime.applyCommandObservation({
    planStep: context.planStep,
    observation,
    commandResult,
  });

  dependencies.emitDebug(() => ({
    stage: 'command-execution',
    command: context.command,
    result: context.outcome.result,
    execution: context.outcome.executionDetails,
    observation,
  }));

  dependencies.emitEvent?.({
    type: 'command-result',
    command: context.command,
    result: commandResult,
    preview: renderPayload,
    execution: context.outcome.executionDetails,
    planStep: context.planStep ? (clonePlanForExecution([context.planStep])[0] ?? null) : null,
  });

  dependencies.planRuntime.emitPlanSnapshot();

  return {
    ...context,
    status: 'emitted',
    observation,
    commandResult,
    preview: renderPayload,
  } satisfies CommandResultEmission;
};
