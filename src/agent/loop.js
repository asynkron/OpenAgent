/**
 * Implements the interactive agent loop that now emits structured events instead of
 * writing directly to the CLI.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { getOpenAIClient, MODEL } from '../openai/client.js';
import {
  runCommand,
  runBrowse,
  runEdit,
  runRead,
  runReplace,
  runEscapeString,
  runUnescapeString,
} from '../commands/run.js';
import {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} from '../commands/preapproval.js';
import { applyFilter, tailLines } from '../utils/text.js';
import { executeAgentPass } from './passExecutor.js';
import { extractResponseText } from '../openai/responseUtils.js';
import { ApprovalManager } from './approvalManager.js';
import { HistoryCompactor } from './historyCompactor.js';
import { createEscState } from './escState.js';
import { AsyncQueue, QUEUE_DONE } from '../utils/asyncQueue.js';
import { cancel as cancelActive } from '../utils/cancellation.js';
import { PromptCoordinator } from './promptCoordinator.js';
import { mergePlanTrees, computePlanProgress } from '../utils/plan.js';

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'There are open tasks in the plan. Do you need help or more info? If not, please continue working.';

export function createAgentRuntime({
  systemPrompt = SYSTEM_PROMPT,
  getClient = getOpenAIClient,
  model = MODEL,
  runCommandFn = runCommand,
  runBrowseFn = runBrowse,
  runEditFn = runEdit,
  runReadFn = runRead,
  runReplaceFn = runReplace,
  runEscapeStringFn = runEscapeString,
  runUnescapeStringFn = runUnescapeString,
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
  createHistoryCompactorFn = ({ openai: client, currentModel }) =>
    new HistoryCompactor({ openai: client, model: currentModel, logger: console }),
} = {}) {
  const outputs = new AsyncQueue();
  const inputs = new AsyncQueue();

  const planDirectoryPath = resolve(process.cwd(), '.openagent');
  const planFilePath = resolve(planDirectoryPath, 'plan.json');
  let activePlan = [];

  const clonePlan = (plan) => mergePlanTrees([], Array.isArray(plan) ? plan : []);

  const persistPlanSnapshot = async () => {
    try {
      await mkdir(planDirectoryPath, { recursive: true });
      const snapshot = `${JSON.stringify(activePlan, null, 2)}\n`;
      await writeFile(planFilePath, snapshot, 'utf8');
    } catch (error) {
      outputs.push({
        type: 'status',
        level: 'warn',
        message: 'Failed to persist plan snapshot to .openagent/plan.json.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const loadPlanSnapshot = async () => {
    try {
      const raw = await readFile(planFilePath, 'utf8');
      if (!raw.trim()) {
        activePlan = [];
        return;
      }

      const parsed = JSON.parse(raw);
      activePlan = clonePlan(parsed);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return;
      }

      outputs.push({
        type: 'status',
        level: 'warn',
        message: 'Failed to load plan snapshot from .openagent/plan.json.',
        details: error instanceof Error ? error.message : String(error),
      });
      activePlan = [];
    }
  };
  const shouldMergePlans = () =>
    Boolean(typeof getPlanMergeFlag === 'function' && getPlanMergeFlag());

  const planManager = {
    get() {
      return clonePlan(activePlan);
    },
    isMergingEnabled() {
      return shouldMergePlans();
    },
    async update(nextPlan) {
      const merging = shouldMergePlans();
      if (!Array.isArray(nextPlan) || nextPlan.length === 0) {
        activePlan = [];
      } else if (merging && activePlan.length > 0) {
        activePlan = mergePlanTrees(activePlan, nextPlan);
      } else {
        activePlan = clonePlan(nextPlan);
      }

      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async initialize() {
      await loadPlanSnapshot();
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
    },
    async reset() {
      if (activePlan.length === 0) {
        return clonePlan(activePlan);
      }
      activePlan = [];
      emitPlanProgressEvent(activePlan);
      await persistPlanSnapshot();
      return clonePlan(activePlan);
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

  const history = [
    {
      role: 'system',
      content: systemPrompt,
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

  const emit = (event) => outputs.push(event);

  const emitDebug = (payloadOrFactory) => {
    if (!isDebugEnabled()) {
      return;
    }

    let payload;
    try {
      payload =
        typeof payloadOrFactory === 'function' ? payloadOrFactory() : payloadOrFactory;
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

  let lastPlanProgressSignature;

  const emitPlanProgressEvent = (plan) => {
    const progress = computePlanProgress(plan);

    if (progress.totalSteps === 0) {
      lastPlanProgressSignature = undefined;
      return progress;
    }

    const signature = `${progress.completedSteps}|${progress.totalSteps}`;

    if (signature !== lastPlanProgressSignature) {
      lastPlanProgressSignature = signature;
      emit({ type: 'plan-progress', progress });
    }

    return progress;
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

        history.push({
          role: 'user',
          content: userInput,
        });

        try {
          let continueLoop = true;

          while (continueLoop) {
            const shouldContinue = await executeAgentPass({
              openai,
              model,
              history,
              emitEvent: emit,
              onDebug: emitDebug,
              runCommandFn,
              runBrowseFn,
              runEditFn,
              runReadFn,
              runReplaceFn,
              runEscapeStringFn,
              runUnescapeStringFn,
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
            });

            continueLoop = shouldContinue;
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

  return {
    outputs,
    inputs,
    start,
    submitPrompt: (value) => inputs.push({ type: 'prompt', prompt: value }),
    cancel: (payload = null) => inputs.push({ type: 'cancel', payload }),
  };
}

export function createAgentLoop(options = {}) {
  const runtime = createAgentRuntime(options);
  return async function agentLoop() {
    await runtime.start();
  };
}

export { extractResponseText } from '../openai/responseUtils.js';

export default {
  createAgentLoop,
  createAgentRuntime,
  extractResponseText,
};
