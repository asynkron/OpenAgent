import type { PlanPersistenceCoordinator } from './persistenceCoordinator.js';
import type { PlanStateMachine } from './stateMachine/index.js';
import { analyzeMessage, applyNoHumanFlagReset, type MessageAnalysis } from './noExecutableMessage.js';
import { resolvePendingWork, resolveRefusal } from './noExecutableOutcomes.js';
import {
  evaluatePlanIdleStatus,
  restorePlanFromPersistenceIfEmpty,
  type PlanIdleStatus,
} from './planIdleStatus.js';
import { createResetReminderEffect, type HandleNoExecutableResult } from './effects.js';

export interface NoExecutableContext {
  readonly parsedMessage: string;
  readonly persistence: PlanPersistenceCoordinator;
  readonly stateMachine: PlanStateMachine;
  readonly passIndex: number;
  readonly getNoHumanFlag?: () => boolean;
  readonly setNoHumanFlag?: (value: boolean) => void;
}

export const handleNoExecutableMessage = async ({
  parsedMessage,
  persistence,
  stateMachine,
  passIndex,
  getNoHumanFlag,
  setNoHumanFlag,
}: NoExecutableContext): Promise<HandleNoExecutableResult> => {
  const effects = [] as HandleNoExecutableResult['effects'];
  const analysis: MessageAnalysis = analyzeMessage(parsedMessage);
  applyNoHumanFlagReset({ analysis, getNoHumanFlag, setNoHumanFlag, effects });

  const planStatus: PlanIdleStatus = evaluatePlanIdleStatus(stateMachine);

  const refusalResult = resolveRefusal({
    analysis,
    passIndex,
    planStatus,
    effects,
  });
  if (refusalResult) {
    return refusalResult;
  }

  const pendingResult = resolvePendingWork({
    planStatus,
    stateMachine,
    effects,
  });
  if (pendingResult) {
    return pendingResult;
  }

  await restorePlanFromPersistenceIfEmpty({
    planStatus,
    persistence,
    stateMachine,
    effects,
  });

  effects.push(createResetReminderEffect());
  return { type: 'stop-cleared', effects } satisfies HandleNoExecutableResult;
};
