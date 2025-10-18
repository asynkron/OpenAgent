import { refusalHeuristics } from '../refusalDetection.js';
import { createRefusalAutoResponseEntry } from '../../historyMessageBuilder.js';
import {
  createHistoryEntryEffect,
  createResetReminderEffect,
  toEmitEffects,
  type PlanRuntimeEffect,
} from './effects.js';

export interface RefusalHandlingContext {
  readonly normalizedMessage: string;
  readonly passIndex: number;
  readonly activePlanEmpty: boolean;
  readonly incomingPlanEmpty: boolean;
}

export const maybeCreateRefusalEffects = ({
  normalizedMessage,
  passIndex,
  activePlanEmpty,
  incomingPlanEmpty,
}: RefusalHandlingContext): PlanRuntimeEffect[] | null => {
  if (
    !activePlanEmpty ||
    !incomingPlanEmpty ||
    !refusalHeuristics.isLikelyRefusalMessage(normalizedMessage)
  ) {
    return null;
  }

  return [
    ...toEmitEffects({
      type: 'status',
      payload: {
        level: 'info',
        message: refusalHeuristics.statusMessage,
        details: null,
      },
    }),
    createHistoryEntryEffect(
      createRefusalAutoResponseEntry({
        autoResponseMessage: refusalHeuristics.autoResponse,
        pass: passIndex,
      }),
    ),
    createResetReminderEffect(),
  ];
};
