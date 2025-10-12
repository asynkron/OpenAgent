/**
 * Implements the interactive agent loop that now emits structured events instead of
 * writing directly to the CLI.
 */

import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { getOpenAIClient, MODEL } from '../openai/client.js';
import { runCommand } from '../commands/run.js';
import {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../services/commandApprovalService.js';
import { applyFilter, tailLines } from '../utils/text.js';
import { executeAgentPass } from './passExecutor.js';
import { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';
import { ApprovalManager } from './approvalManager.js';
import { HistoryCompactor } from './historyCompactor.js';
import { createEscState } from './escState.js';
import { AsyncQueue, QUEUE_DONE } from '../utils/asyncQueue.js';
import { cancel as cancelActive } from '../utils/cancellation.js';
import { PromptCoordinator } from './promptCoordinator.js';
import { createPlanManager } from './planManager.js';
import { AmnesiaManager, applyDementiaPolicy } from './amnesiaManager.js';
import { createChatMessageEntry } from './historyEntry.js';

function cloneEventPayload(event) {
  if (event === null || typeof event !== 'object') {
    return event;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(event);
    } catch (error) {
      // Fall back to JSON serialization when structured cloning is unavailable
      // or the payload contains values that cannot be cloned directly.
    }
  }

  try {
    return JSON.parse(JSON.stringify(event));
  } catch (error) {
    return Array.isArray(event) ? [...event] : { ...event };
  }
}

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'The plan is not completed, either send a command to continue, update the plan, take a deep breath and reanalyze the situation, add/remove steps or sub-steps, or abandon the plan if we don´t know how to continue';

export function createAgentRuntime({
  systemPrompt = SYSTEM_PROMPT,
  systemPromptAugmentation = '',
  getClient = getOpenAIClient,
  model = MODEL,
  runCommandFn = runCommand,
  applyFilterFn = applyFilter,
  tailLinesFn = tailLines,
  isPreapprovedCommandFn = isPreapprovedCommand,
  isSessionApprovedFn = isSessionApproved,
  approveForSessionFn = approveForSession,
  preapprovedCfg = PREAPPROVED_CFG,
  getAutoApproveFlag = () => false,
  getNoHumanFlag = () => false,
  getPlanMergeFlag = () => false,
  getDebugFlag = () => false,
  setNoHumanFlag = () => {},
  emitAutoApproveStatus = false,
  createHistoryCompactorFn = ({ openai: client, currentModel }) =>
    new HistoryCompactor({ openai: client, model: currentModel, logger: console }),
  dementiaLimit = 30,
  amnesiaLimit = 10,
  createAmnesiaManagerFn = (config) => new AmnesiaManager(config),
  createOutputsQueueFn = () => new AsyncQueue(),
  createInputsQueueFn = () => new AsyncQueue(),
  createPlanManagerFn = (config) => createPlanManager(config),
  createEscStateFn = () => createEscState(),
  createPromptCoordinatorFn = (config) => new PromptCoordinator(config),
  createApprovalManagerFn = (config) => new ApprovalManager(config),
} = {}) {
  const outputs = createOutputsQueueFn();
  if (
    !outputs ||
    typeof outputs.push !== 'function' ||
    typeof outputs.close !== 'function' ||
    typeof outputs.next !== 'function'
  ) {
    throw new TypeError('createOutputsQueueFn must return an AsyncQueue-like object.');
  }

  const inputs = createInputsQueueFn();
  if (
    !inputs ||
    typeof inputs.push !== 'function' ||
    typeof inputs.close !== 'function' ||
    typeof inputs.next !== 'function'
  ) {
    throw new TypeError('createInputsQueueFn must return an AsyncQueue-like object.');
  }
  let counter = 0;
  let passCounter = 0;
  const emit = (event) => {
    const clonedEvent = cloneEventPayload(event);

    if (!clonedEvent || typeof clonedEvent !== 'object') {
      throw new TypeError('Agent emit expected event to be an object.');
    }

    clonedEvent.__id = 'key' + counter++;
    outputs.push(clonedEvent);
  };

  const nextPass = () => {
    passCounter += 1;
    return passCounter;
  };

  const planManagerConfig = {
    emit,
    emitStatus: (event) => outputs.push(event),
    getPlanMergeFlag,
  };

  let planManager = null;
  try {
    planManager = createPlanManagerFn(planManagerConfig);
  } catch (error) {
    emit({
      type: 'status',
      level: 'warn',
      message: 'Failed to initialize plan manager via factory.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  if (!planManager || typeof planManager !== 'object') {
    planManager = createPlanManager(planManagerConfig);
  }

  // Track how many consecutive plan reminders we have injected so that the
  // agent eventually defers to a human if progress stalls.
  let planReminderAutoResponseCount = 0;
  const planAutoResponseTracker = {
    increment() {
      planReminderAutoResponseCount += 1;
      return planReminderAutoResponseCount;
    },
    reset() {
      planReminderAutoResponseCount = 0;
    },
    getCount() {
      return planReminderAutoResponseCount;
    },
  };

  const fallbackEscController = createEscState();
  let escController = fallbackEscController;

  try {
    const candidate = createEscStateFn();
    if (candidate && typeof candidate === 'object') {
      escController = {
        ...candidate,
        state: candidate.state ?? fallbackEscController.state,
        trigger:
          typeof candidate.trigger === 'function'
            ? candidate.trigger
            : fallbackEscController.trigger,
        detach:
          typeof candidate.detach === 'function'
            ? candidate.detach
            : fallbackEscController.detach,
      };
    }
  } catch (error) {
    emit({
      type: 'status',
      level: 'warn',
      message: 'Failed to initialize ESC state via factory.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const escState = escController.state;
  const triggerEsc = escController.trigger;
  const detachEscListener = escController.detach;

  const promptCoordinatorConfig = {
    emitEvent: (event) => outputs.push(event),
    escState: { ...escState, trigger: triggerEsc },
    cancelFn: cancelActive,
  };

  let promptCoordinator = null;
  try {
    promptCoordinator = createPromptCoordinatorFn(promptCoordinatorConfig);
  } catch (error) {
    emit({
      type: 'status',
      level: 'warn',
      message: 'Failed to initialize prompt coordinator via factory.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  if (!promptCoordinator || typeof promptCoordinator !== 'object') {
    promptCoordinator = new PromptCoordinator(promptCoordinatorConfig);
  }

  let openai;
  try {
    openai = getClient();
  } catch (err) {
    outputs.push({
      type: 'error',
      message: 'Failed to initialize OpenAI client. Ensure API key is configured.',
      details: err instanceof Error ? err.message : String(err),
    });
    outputs.close();
    inputs.close();
    throw err;
  }

  const approvalManagerConfig = {
    isPreapprovedCommand: isPreapprovedCommandFn,
    isSessionApproved: isSessionApprovedFn,
    approveForSession: approveForSessionFn,
    getAutoApproveFlag,
    askHuman: async (prompt) => promptCoordinator.request(prompt, { scope: 'approval' }),
    preapprovedCfg,
    logWarn: (message) => outputs.push({ type: 'status', level: 'warn', message }),
    logSuccess: (message) => outputs.push({ type: 'status', level: 'info', message }),
  };

  let approvalManager = null;
  try {
    approvalManager = createApprovalManagerFn(approvalManagerConfig);
  } catch (error) {
    emit({
      type: 'status',
      level: 'warn',
      message: 'Failed to initialize approval manager via factory.',
      details: error instanceof Error ? error.message : String(error),
    });
  }

  if (!approvalManager || typeof approvalManager !== 'object') {
    approvalManager = new ApprovalManager(approvalManagerConfig);
  }

  const augmentation =
    typeof systemPromptAugmentation === 'string' ? systemPromptAugmentation.trim() : '';
  const combinedSystemPrompt = augmentation ? `${systemPrompt}\n\n${augmentation}` : systemPrompt;

  const history = [
    createChatMessageEntry({
      eventType: 'chat-message',
      role: 'system',
      content: combinedSystemPrompt,
      pass: 0,
    }),
  ];

  const normalizedAmnesiaLimit =
    typeof amnesiaLimit === 'number' && Number.isFinite(amnesiaLimit) && amnesiaLimit > 0
      ? Math.floor(amnesiaLimit)
      : 0;

  let amnesiaManager = null;
  if (normalizedAmnesiaLimit > 0 && typeof createAmnesiaManagerFn === 'function') {
    try {
      amnesiaManager = createAmnesiaManagerFn({ threshold: normalizedAmnesiaLimit });
    } catch (error) {
      emit({
        type: 'status',
        level: 'warn',
        message: '[memory] Failed to initialize amnesia manager.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const normalizedDementiaLimit =
    typeof dementiaLimit === 'number' && Number.isFinite(dementiaLimit) && dementiaLimit > 0
      ? Math.floor(dementiaLimit)
      : 0;

  const historyCompactor =
    typeof createHistoryCompactorFn === 'function'
      ? createHistoryCompactorFn({ openai, currentModel: model })
      : null;

  let running = false;
  let inputProcessorPromise = null;

  async function processInputEvents() {
    try {
      while (true) {
        const event = await inputs.next();
        if (event === QUEUE_DONE) {
          promptCoordinator.close();
          return;
        }
        if (!event || typeof event !== 'object') {
          continue;
        }
        if (event.type === 'cancel') {
          promptCoordinator.handleCancel(event.payload ?? null);
        } else if (event.type === 'prompt') {
          promptCoordinator.handlePrompt(event.prompt ?? event.value ?? '');
        }
      }
    } catch (error) {
      outputs.push({
        type: 'error',
        message: 'Input processing terminated unexpectedly.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const isDebugEnabled = () => Boolean(typeof getDebugFlag === 'function' && getDebugFlag());

  const emitDebug = (payloadOrFactory) => {
    if (!isDebugEnabled()) {
      return;
    }

    let payload;
    try {
      payload = typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
    } catch (error) {
      emit({
        type: 'status',
        level: 'warn',
        message: 'Failed to prepare debug payload.',
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (typeof payload === 'undefined') {
      return;
    }

    emit({ type: 'debug', payload });
  };

  const enforceMemoryPolicies = (currentPass) => {
    if (!Number.isFinite(currentPass) || currentPass <= 0) {
      return;
    }

    let mutated = false;

    if (amnesiaManager && typeof amnesiaManager.apply === 'function') {
      try {
        mutated = amnesiaManager.apply({ history, currentPass }) || mutated;
      } catch (error) {
        emit({
          type: 'status',
          level: 'warn',
          message: '[memory] Failed to apply amnesia filter.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (normalizedDementiaLimit > 0) {
      try {
        mutated =
          applyDementiaPolicy({
            history,
            currentPass,
            limit: normalizedDementiaLimit,
          }) || mutated;
      } catch (error) {
        emit({
          type: 'status',
          level: 'warn',
          message: '[memory] Failed to apply dementia pruning.',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (mutated) {
      emitDebug(() => ({
        stage: 'memory-policy-applied',
        historyLength: history.length,
      }));
    }
  };

  async function start() {
    if (running) {
      throw new Error('Agent runtime already started.');
    }
    running = true;
    inputProcessorPromise = processInputEvents();

    if (planManager && typeof planManager.initialize === 'function') {
      await planManager.initialize();
    }

    emit({ type: 'banner', title: 'OpenAgent - AI Agent with JSON Protocol' });
    emit({ type: 'status', level: 'info', message: 'Submit prompts to drive the conversation.' });
    if (getAutoApproveFlag()) {
      emit({
        type: 'status',
        level: 'warn',
        message:
          'Full auto-approval mode enabled via CLI flag. All commands will run without prompting.',
      });
    }
    if (getNoHumanFlag()) {
      emit({
        type: 'status',
        level: 'warn',
        message:
          'No-human mode enabled (--nohuman). Agent will auto-respond with "continue or say \'done\'" until the AI replies "done".',
      });
    }

    const startThinkingEvent = () => emit({ type: 'thinking', state: 'start' });
    const stopThinkingEvent = () => emit({ type: 'thinking', state: 'stop' });

    try {
      while (true) {
        const noHumanActive = getNoHumanFlag();
        const userInput = noHumanActive
          ? NO_HUMAN_AUTO_MESSAGE
          : await promptCoordinator.request('\n ▷ ', { scope: 'user-input' });

        if (!userInput) {
          if (noHumanActive) {
            continue;
          }
          continue;
        }

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          emit({ type: 'status', level: 'info', message: 'Goodbye!' });
          break;
        }

        const activePass = nextPass();

        history.push(
          createChatMessageEntry({
            eventType: 'chat-message',
            role: 'user',
            content: userInput,
            pass: activePass,
          }),
        );

        enforceMemoryPolicies(activePass);

        try {
          let continueLoop = true;
          let currentPass = activePass;

          while (continueLoop) {
            const shouldContinue = await executeAgentPass({
              openai,
              model,
              history,
              emitEvent: emit,
              onDebug: emitDebug,
              runCommandFn,
              applyFilterFn,
              tailLinesFn,
              getNoHumanFlag,
              setNoHumanFlag,
              planReminderMessage: PLAN_PENDING_REMINDER,
              startThinkingFn: startThinkingEvent,
              stopThinkingFn: stopThinkingEvent,
              escState,
              approvalManager,
              historyCompactor,
              planManager,
              planAutoResponseTracker,
              emitAutoApproveStatus,
              passIndex: currentPass,
            });

            enforceMemoryPolicies(currentPass);

            if (!shouldContinue) {
              continueLoop = false;
            } else {
              currentPass = nextPass();
              continueLoop = true;
            }
          }
        } catch (error) {
          emit({
            type: 'error',
            message: 'Agent loop encountered an error.',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      inputs.close();
      outputs.close();
      detachEscListener?.();
      await inputProcessorPromise;
    }
  }

  const getHistorySnapshot = () =>
    history.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      return { ...entry };
    });

  return {
    outputs,
    inputs,
    start,
    submitPrompt: (value) => inputs.push({ type: 'prompt', prompt: value }),
    cancel: (payload = null) => inputs.push({ type: 'cancel', payload }),
    getHistorySnapshot,
  };
}

export function createAgentLoop(options = {}) {
  const runtime = createAgentRuntime(options);
  return async function agentLoop() {
    await runtime.start();
  };
}

export { extractOpenAgentToolCall, extractResponseText } from '../openai/responseUtils.js';

export default {
  createAgentLoop,
  createAgentRuntime,
  extractOpenAgentToolCall,
  extractResponseText,
};
