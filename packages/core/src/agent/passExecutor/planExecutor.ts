import type ObservationBuilder from '../observationBuilder.js';
import { PlanRuntime } from './planRuntime.js';
import type { ExecutableCandidate } from './planRuntime.js';
import { createCommandRuntime } from './commandRuntime.js';
import type { DebugEmitter } from './debugEmitter.js';
import type { PlanManagerAdapter } from './planManagerAdapter.js';
import type { NormalizedExecuteAgentPassOptions } from './types.js';
import type { ToolResponse } from '../../contracts/index.js';
import type { PlanStep } from './planExecution.js';

export type PlanExecutorOutcome = 'continue' | 'stop' | 'no-executable';

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
    planAutoResponseTracker: options.planAutoResponseTracker,
    getNoHumanFlag: options.getNoHumanFlag,
    setNoHumanFlag: options.setNoHumanFlag,
  });

  await planRuntime.initialize(incomingPlan);

  let nextExecutable: ExecutableCandidate | null = planRuntime.selectNextExecutableEntry();

  if (!nextExecutable) {
    const assistantMessage = typeof parsedResponse.message === 'string' ? parsedResponse.message : '';
    const outcome = await planRuntime.handleNoExecutable({ parsedMessage: assistantMessage });
    return outcome === 'continue' ? 'no-executable' : 'stop';
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
    emitAutoApproveStatus: options.emitAutoApproveStatus,
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
      if (loopResult === 'stop') {
        return 'stop';
      }
      nextExecutable = planRuntime.selectNextExecutableEntry();
    }
  } finally {
    if (manageCommandThinking) {
      options.stopThinkingFn();
    }
  }

  await planRuntime.finalize();
  planRuntime.resetPlanReminder();

  return 'continue';
};
