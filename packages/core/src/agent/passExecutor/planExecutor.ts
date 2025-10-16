import type ObservationBuilder from '../observationBuilder.js';
import { PlanRuntime } from './planRuntime.js';
import type { ExecutableCandidate } from './planRuntime.js';
import { createCommandRuntime } from './commandRuntime.js';
import type { DebugEmitter } from './debugEmitter.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { NormalizedExecuteAgentPassOptions } from './types.js';
import type { ToolResponse } from '../../contracts/index.js';
import type { PlanStep } from './planExecution.js';

export type PlanExecutorOutcome = 'continue' | 'stop' | 'no-executable' | 'command-rejected';

export const executePlan = async ({
  parsedResponse,
  options,
  planManagerAdapter,
  observationBuilder,
  debugEmitter,
}: {
  parsedResponse: ToolResponse;
  options: NormalizedExecuteAgentPassOptions;
  planManagerAdapter: PlanManagerAdapter | null;
  observationBuilder: ObservationBuilder;
  debugEmitter: DebugEmitter;
}): Promise<PlanExecutorOutcome> => {
  const incomingPlan: PlanStep[] | null = Array.isArray(parsedResponse.plan)
    ? (parsedResponse.plan as unknown as PlanStep[])
    : null;

  const planRuntime = new PlanRuntime({
    history: options.history,
    passIndex: options.passIndex,
    emitEvent: options.emitEvent,
    planReminderMessage: options.planReminderMessage,
    planManager: planManagerAdapter,
    planAutoResponseTracker: options.planAutoResponseTracker ?? null,
    getNoHumanFlag: options.getNoHumanFlag,
    setNoHumanFlag: options.setNoHumanFlag,
  });

  const initialization = await planRuntime.initialize(incomingPlan);
  planRuntime.applyEffects(initialization.effects);

  let nextExecutable: ExecutableCandidate | null = planRuntime.selectNextExecutableEntry();

  if (!nextExecutable) {
    const assistantMessage = typeof parsedResponse.message === 'string' ? parsedResponse.message : '';
    const outcome = await planRuntime.handleNoExecutable({ parsedMessage: assistantMessage });
    planRuntime.applyEffects(outcome.effects);
    if (outcome.type === 'continue-refusal' || outcome.type === 'continue-pending') {
      return 'no-executable';
    }
    return 'stop';
  }

  planRuntime.resetPlanReminder();

  const manageCommandThinking =
    typeof options.startThinkingFn === 'function' && typeof options.stopThinkingFn === 'function';

  if (manageCommandThinking) {
    options.startThinkingFn();
  }

  const commandRuntime = createCommandRuntime({
    approvalManager: options.approvalManager,
    emitEvent: options.emitEvent,
    emitAutoApproveStatus: options.emitAutoApproveStatus ?? false,
    runCommandFn: options.runCommandFn,
    executeAgentCommandFn: options.executeAgentCommandFn,
    incrementCommandCountFn: options.incrementCommandCountFn,
    observationBuilder,
    planRuntime,
    emitDebug: debugEmitter.emit,
  });

  try {
    while (nextExecutable) {
      const loopResult = await commandRuntime.execute(nextExecutable);
      if (loopResult === 'command-rejected') {
        return 'command-rejected';
      }
      nextExecutable = planRuntime.selectNextExecutableEntry();
    }
  } finally {
    if (manageCommandThinking) {
      options.stopThinkingFn();
    }
  }

  const finalization = await planRuntime.finalize();
  planRuntime.applyEffects(finalization.effects);
  planRuntime.resetPlanReminder();

  return 'continue';
};
