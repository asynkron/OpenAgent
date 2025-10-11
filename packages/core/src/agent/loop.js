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
} = {}) {
  const outputs = new AsyncQueue();
  const inputs = new AsyncQueue();
  let counter = 0;
  let passCounter = 0;
  const emit = (event) => {
    event.__id = 'key' + counter++;
    outputs.push(event);
  };

  const nextPass = () => {
    passCounter += 1;
    return passCounter;
  };

  const planManager = createPlanManager({
    emit,
    emitStatus: (event) => outputs.push(event),
    getPlanMergeFlag,
  });

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

  const { state: escState, trigger: triggerEsc, detach: detachEscListener } = createEscState();
  const promptCoordinator = new PromptCoordinator({
    emitEvent: (event) => outputs.push(event),
    escState: { ...escState, trigger: triggerEsc },
    cancelFn: cancelActive,
  });

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

  const approvalManager = new ApprovalManager({
    isPreapprovedCommand: isPreapprovedCommandFn,
    isSessionApproved: isSessionApprovedFn,
    approveForSession: approveForSessionFn,
    getAutoApproveFlag,
    askHuman: async (prompt) => promptCoordinator.request(prompt, { scope: 'approval' }),
    preapprovedCfg,
    logWarn: (message) => outputs.push({ type: 'status', level: 'warn', message }),
    logSuccess: (message) => outputs.push({ type: 'status', level: 'info', message }),
  });

  const augmentation =
    typeof systemPromptAugmentation === 'string' ? systemPromptAugmentation.trim() : '';
  const combinedSystemPrompt = augmentation ? `${systemPrompt}\n\n${augmentation}` : systemPrompt;

  const history = [
    {
      type: 'chat-message',
      role: 'system',
      content: combinedSystemPrompt,
      pass: 0,
    },
  ];

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

  async function start() {
    if (running) {
      throw new Error('Agent runtime already started.');
    }
    running = true;
    inputProcessorPromise = processInputEvents();

    await planManager.initialize();

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

        history.push({
          type: 'chat-message',
          role: 'user',
          content: userInput,
          pass: activePass,
        });

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
