/**
 * Implements the interactive agent loop that now emits structured events instead of
 * writing directly to the CLI.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
import { createChatMessageEntry, mapHistoryToOpenAIMessages } from './historyEntry.js';
import { requestModelCompletion as defaultRequestModelCompletion } from './openaiRequest.js';

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";
const PLAN_PENDING_REMINDER =
  'The plan is not completed, either send a command to continue, update the plan, take a deep breath and reanalyze the situation, add/remove steps or sub-steps, or abandon the plan if we don´t know how to continue';

// Guardrail used to detect runaway payload growth between consecutive model calls.
const MAX_REQUEST_GROWTH_FACTOR = 5;

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
  createHistoryCompactorFn = ({ openai: client, currentModel, logger }) =>
    new HistoryCompactor({ openai: client, model: currentModel, logger: logger ?? console }),
  dementiaLimit = 30,
  amnesiaLimit = 10,
  createAmnesiaManagerFn = (config) => new AmnesiaManager(config),
  createOutputsQueueFn = () => new AsyncQueue(),
  createInputsQueueFn = () => new AsyncQueue(),
  createPlanManagerFn = (config) => createPlanManager(config),
  createEscStateFn = () => createEscState(),
  createPromptCoordinatorFn = (config) => new PromptCoordinator(config),
  createApprovalManagerFn = (config) => new ApprovalManager(config),
  // New DI hooks
  logger = console,
  idGeneratorFn = null,
  applyDementiaPolicyFn = applyDementiaPolicy,
  createChatMessageEntryFn = createChatMessageEntry,
  executeAgentPassFn = executeAgentPass,
  createPlanAutoResponseTrackerFn = null,
  // Additional DI hooks
  cancelFn = cancelActive,
  planReminderMessage = PLAN_PENDING_REMINDER,
  userInputPrompt = '\n ▷ ',
  noHumanAutoMessage = NO_HUMAN_AUTO_MESSAGE,
  // New additions
  eventObservers = null,
  idPrefix = 'key',
  // Dependency bag forwarded to executeAgentPass for deeper DI customization
  passExecutorDeps = null,
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
  let previousRequestPayloadSize = null;

  const logWithFallback = (level, message, details = null) => {
    const sink = logger ?? console;
    const fn = sink && typeof sink[level] === 'function' ? sink[level].bind(sink) : null;
    if (fn) {
      fn(message, details);
    } else if (sink && typeof sink.log === 'function') {
      sink.log(message, details);
    }
  };

  const historyDumpDirectory = join(process.cwd(), '.openagent', 'failsafe-history');

  const dumpHistorySnapshot = async ({ historyEntries = [], passIndex }) => {
    await mkdir(historyDumpDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = Number.isFinite(passIndex) ? `pass-${passIndex}-` : 'pass-unknown-';
    const filePath = join(historyDumpDirectory, `${prefix}${timestamp}.json`);
    await writeFile(filePath, JSON.stringify(historyEntries, null, 2), 'utf8');
    return filePath;
  };

  const estimateRequestPayloadSize = (historySnapshot, modelName) => {
    try {
      const payload = {
        model: modelName,
        input: mapHistoryToOpenAIMessages(historySnapshot),
        tool_choice: { type: 'function', name: 'open-agent' },
      };
      const serialized = JSON.stringify(payload);
      return typeof serialized === 'string' ? Buffer.byteLength(serialized, 'utf8') : null;
    } catch (error) {
      logWithFallback('warn', '[failsafe] Unable to estimate OpenAI payload size before request.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const buildGuardedRequestModelCompletion = (delegate) => {
    const requestFn = typeof delegate === 'function' ? delegate : defaultRequestModelCompletion;

    const guardRequestPayloadSize = async (options) => {
      const payloadSize = estimateRequestPayloadSize(options?.history, options?.model);
      if (Number.isFinite(previousRequestPayloadSize) && Number.isFinite(payloadSize)) {
        const growthFactor = payloadSize / previousRequestPayloadSize;
        // Only treat this as runaway growth if the payload both jumps by ~5x and
        // adds at least 1 KiB of new content—this avoids tripping on tiny histories.
        if (
          growthFactor >= MAX_REQUEST_GROWTH_FACTOR &&
          payloadSize - previousRequestPayloadSize > 1024
        ) {
          logWithFallback(
            'error',
            `[failsafe] OpenAI request ballooned from ${previousRequestPayloadSize}B to ${payloadSize}B on pass ${options?.passIndex ?? 'unknown'}.`,
          );
          try {
            const dumpPath = await dumpHistorySnapshot({
              historyEntries: Array.isArray(options?.history) ? options.history : [],
              passIndex: options?.passIndex,
            });
            if (dumpPath) {
              logWithFallback('error', `[failsafe] Dumped history snapshot to ${dumpPath}.`);
            }
          } catch (dumpError) {
            logWithFallback('error', '[failsafe] Failed to persist history snapshot.', {
              error: dumpError instanceof Error ? dumpError.message : String(dumpError),
            });
          }
          logWithFallback('error', '[failsafe] Exiting to prevent excessive API charges.');
          process.exit(1);
        }
      }

      if (Number.isFinite(payloadSize)) {
        previousRequestPayloadSize = payloadSize;
      }

      return payloadSize;
    };

    const guardedRequest = async (options) => {
      await guardRequestPayloadSize(options);
      return requestFn(options);
    };

    guardedRequest.guardRequestPayloadSize = guardRequestPayloadSize;

    return guardedRequest;
  };
  const nextId = () => {
    try {
      if (typeof idGeneratorFn === 'function') {
        const id = idGeneratorFn({ counter });
        if (id) return String(id);
      }
    } catch (e) {
      // ignore and fall back
    }
    return idPrefix + counter++;
  };

  const emit = (event) => {
    if (!event || typeof event !== 'object') {
      throw new TypeError('Agent emit expected event to be an object.');
    }
    // Hard requirement: stringify, deserialize, emit — always deep clone via JSON serialization.
    const clonedEvent = JSON.parse(JSON.stringify(event));
    clonedEvent.__id = nextId();
    outputs.push(clonedEvent);
    if (Array.isArray(eventObservers)) {
      for (const obs of eventObservers) {
        if (typeof obs !== 'function') continue;
        try {
          obs(clonedEvent);
        } catch (e) {
          outputs.push({ type: 'status', level: 'warn', message: 'eventObservers item threw.' });
        }
      }
    }
  };

  const nextPass = () => {
    passCounter += 1;
    emit({ type: 'pass', pass: passCounter });
    return passCounter;
  };

  const planManagerConfig = {
    emit,
    emitStatus: (event) => emit(event),
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
  const defaultPlanAutoResponseTracker = () => {
    let count = 0;
    return {
      increment() {
        count += 1;
        return count;
      },
      reset() {
        count = 0;
      },
      getCount() {
        return count;
      },
    };
  };

  const planAutoResponseTracker =
    (typeof createPlanAutoResponseTrackerFn === 'function' && createPlanAutoResponseTrackerFn()) ||
    defaultPlanAutoResponseTracker();

  const normalizedPassExecutorDeps =
    passExecutorDeps && typeof passExecutorDeps === 'object' ? { ...passExecutorDeps } : {};
  normalizedPassExecutorDeps.requestModelCompletionFn = buildGuardedRequestModelCompletion(
    normalizedPassExecutorDeps.requestModelCompletionFn,
  );
  if (
    normalizedPassExecutorDeps.requestModelCompletionFn &&
    typeof normalizedPassExecutorDeps.requestModelCompletionFn.guardRequestPayloadSize ===
      'function'
  ) {
    normalizedPassExecutorDeps.guardRequestPayloadSizeFn =
      normalizedPassExecutorDeps.requestModelCompletionFn.guardRequestPayloadSize;
  }

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
          typeof candidate.detach === 'function' ? candidate.detach : fallbackEscController.detach,
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
    emitEvent: (event) => emit(event),
    escState: { ...escState, trigger: triggerEsc },
    cancelFn,
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
    emit({
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
    logWarn: (message) => emit({ type: 'status', level: 'warn', message }),
    logSuccess: (message) => emit({ type: 'status', level: 'info', message }),
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
    createChatMessageEntryFn({
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
      ? createHistoryCompactorFn({ openai, currentModel: model, logger })
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
      emit({
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
          (applyDementiaPolicyFn || applyDementiaPolicy)({
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
          ? noHumanAutoMessage
          : await promptCoordinator.request(userInputPrompt, { scope: 'user-input' });

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
          createChatMessageEntryFn({
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
            const shouldContinue = await (executeAgentPassFn || executeAgentPass)({
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
              planReminderMessage,
              startThinkingFn: startThinkingEvent,
              stopThinkingFn: stopThinkingEvent,
              escState,
              approvalManager,
              historyCompactor,
              planManager,
              planAutoResponseTracker,
              emitAutoApproveStatus,
              passIndex: currentPass,
              ...normalizedPassExecutorDeps,
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
