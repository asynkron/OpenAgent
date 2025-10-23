import { RuntimeEventType } from '../contracts/events.js';
import { QUEUE_DONE } from '../utils/asyncQueue.js';
import type {
  AgentInputEvent,
  AsyncQueueLike,
  EmitRuntimeEventOptions,
  HistorySnapshot,
  RuntimeEvent,
} from './runtimeTypes.js';
import type { ExecuteAgentPassOptions } from './passExecutor.js';
import type { EmitEvent } from './passExecutor/types.js';
import type { HistoryCompactor as HistoryCompactorClass } from './historyCompactor.js';
import type { HistoryCompactorLike } from './runtimeTypes.js';
import type { PromptRequestMetadata } from './promptCoordinator.js';
import type { ChatMessageEntry } from './historyEntry.js';

export interface PromptCoordinatorLike {
  request(prompt: string, metadata?: PromptRequestMetadata | null): Promise<string>;
  handlePrompt(value: string): void;
  handleCancel(payload?: unknown): void;
  close(): void;
}

export interface PassExecutionBaseOptions extends Omit<ExecuteAgentPassOptions, 'passIndex'> {}

export type PassExecutor = (options: ExecuteAgentPassOptions) => Promise<boolean>;

export type PassExecutionContext = {
  passExecutor: PassExecutor;
  baseOptions: PassExecutionBaseOptions;
  enforceMemoryPolicies: (pass: number) => void;
  nextPass: () => number;
};

export interface ConversationLoopContext {
  promptCoordinator: PromptCoordinatorLike;
  getNoHumanFlag: () => boolean;
  noHumanAutoMessage: string;
  userInputPrompt: string;
  emit: EmitEvent;
  history: HistorySnapshot;
  createChatMessageEntryFn: (options: {
    eventType: string;
    role: string;
    content: string;
    pass: number;
  }) => ChatMessageEntry;
  enforceMemoryPolicies: (pass: number) => void;
  passContext: PassExecutionContext;
  onPassError: (error: unknown) => void;
}

export async function processAgentInputs({
  inputsQueue,
  promptCoordinator,
  emit,
}: {
  inputsQueue: AsyncQueueLike<AgentInputEvent>;
  promptCoordinator: PromptCoordinatorLike;
  emit: EmitEvent;
}): Promise<void> {
  try {
    while (true) {
      const event = await inputsQueue.next();
      if (event === QUEUE_DONE) {
        promptCoordinator.close();
        return;
      }
      if (!event || typeof event !== 'object') {
        continue;
      }
      handleAgentInputEvent(event as AgentInputEvent, promptCoordinator);
    }
  } catch (error) {
    emit({
      type: RuntimeEventType.Error,
      payload: {
        message: 'Input processing terminated unexpectedly.',
        details: error instanceof Error ? error.message : String(error),
        raw: null,
        attempts: null,
      },
    });
  }
}

export async function initializePlanManagerIfNeeded(planManager: unknown): Promise<void> {
  if (planManager && typeof (planManager as { initialize?: () => Promise<void> }).initialize === 'function') {
    await (planManager as { initialize: () => Promise<void> }).initialize();
  }
}

export function emitSessionIntro({
  emit,
  getAutoApproveFlag,
  getNoHumanFlag,
}: {
  emit: EmitEvent;
  getAutoApproveFlag: () => boolean;
  getNoHumanFlag: () => boolean;
}): void {
  emit({
    type: RuntimeEventType.Banner,
    payload: {
      title: 'OpenAgent - AI Agent with JSON Protocol',
      subtitle: null,
    },
  });
  emit({
    type: RuntimeEventType.Status,
    payload: {
      level: 'info',
      message: 'Submit prompts to drive the conversation.',
      details: null,
    },
  });
  if (getAutoApproveFlag()) {
    emit({
      type: RuntimeEventType.Status,
      payload: {
        level: 'warn',
        message:
          'Full auto-approval mode enabled via CLI flag. All commands will run without prompting.',
        details: null,
      },
    });
  }
  if (getNoHumanFlag()) {
    emit({
      type: RuntimeEventType.Status,
      payload: {
        level: 'warn',
        message:
          "No-human mode enabled (--nohuman). Agent will auto-respond with \"continue or say 'done'\" until the AI replies \"done\".",
        details: null,
      },
    });
  }
}

export function createThinkingController(emit: EmitEvent): {
  start: () => void;
  stop: () => void;
} {
  return {
    start: () => emit({ type: RuntimeEventType.Thinking, payload: { state: 'start' } }),
    stop: () => emit({ type: RuntimeEventType.Thinking, payload: { state: 'stop' } }),
  };
}

export type HumanInputStepStatus = 'exit' | 'skip' | 'continue';

export interface HumanInputStepResult {
  status: HumanInputStepStatus;
  value: string | null;
}

export interface ProcessPromptStepOptions {
  history: HistorySnapshot;
  createChatMessageEntryFn: (options: {
    eventType: string;
    role: string;
    content: string;
    pass: number;
  }) => ChatMessageEntry;
  enforceMemoryPolicies: (pass: number) => void;
  passContext: PassExecutionContext;
  prompt: string;
}

export interface ProcessPromptStepResult {
  passIndex: number;
}

export async function runConversationLoop(context: ConversationLoopContext): Promise<void> {
  while (true) {
    const humanInput = await performHumanInputStep({
      promptCoordinator: context.promptCoordinator,
      getNoHumanFlag: context.getNoHumanFlag,
      noHumanAutoMessage: context.noHumanAutoMessage,
      userInputPrompt: context.userInputPrompt,
    });

    if (humanInput.status === 'exit') {
      context.emit({
        type: RuntimeEventType.Status,
        payload: {
          level: 'info',
          message: 'Goodbye!',
          details: null,
        },
      });
      break;
    }

    if (humanInput.status === 'skip') {
      continue;
    }

    const processedPrompt = processPromptStep({
      history: context.history,
      createChatMessageEntryFn: context.createChatMessageEntryFn,
      enforceMemoryPolicies: context.enforceMemoryPolicies,
      passContext: context.passContext,
      prompt: humanInput.value ?? '',
    });

    try {
      await performResponseAndPlanSteps({
        initialPass: processedPrompt.passIndex,
        passContext: context.passContext,
      });
    } catch (error) {
      context.onPassError(error);
    }
  }
}

export function normalizeHistoryCompactor(
  candidate: HistoryCompactorClass | HistoryCompactorLike | null,
): HistoryCompactorClass | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (typeof (candidate as HistoryCompactorClass).compactIfNeeded === 'function') {
    return candidate as HistoryCompactorClass;
  }
  return null;
}

function handleAgentInputEvent(event: AgentInputEvent, promptCoordinator: PromptCoordinatorLike): void {
  if (event.type === 'cancel') {
    promptCoordinator.handleCancel(event.payload ?? null);
    return;
  }
  if (event.type === 'prompt') {
    const value = event.prompt ?? event.value ?? '';
    promptCoordinator.handlePrompt(value);
  }
}

/**
 * Step 1: Collect human input (or auto-generated input when --nohuman is active).
 * Returns a structured result so the caller can decide whether to exit, skip, or
 * continue with prompt processing.
 */
export async function performHumanInputStep({
  promptCoordinator,
  getNoHumanFlag,
  noHumanAutoMessage,
  userInputPrompt,
}: {
  promptCoordinator: PromptCoordinatorLike;
  getNoHumanFlag: () => boolean;
  noHumanAutoMessage: string;
  userInputPrompt: string;
}): Promise<HumanInputStepResult> {
  const noHumanActive = getNoHumanFlag();
  const userInput = noHumanActive
    ? noHumanAutoMessage
    : await promptCoordinator.request(userInputPrompt, { scope: 'user-input' });

  if (!userInput) {
    return { status: 'skip', value: null };
  }

  if (isExitCommand(userInput)) {
    return { status: 'exit', value: null };
  }

  return { status: 'continue', value: userInput };
}

/**
 * Step 2: Persist the human prompt in history and enforce memory policies before
 * handing control to the pass executor.
 */
export function processPromptStep(options: ProcessPromptStepOptions): ProcessPromptStepResult {
  const passIndex = options.passContext.nextPass();

  options.history.push(
    options.createChatMessageEntryFn({
      eventType: 'chat-message',
      role: 'user',
      content: options.prompt,
      pass: passIndex,
    }),
  );

  options.enforceMemoryPolicies(passIndex);

  return { passIndex };
}

/**
 * Steps 3-5: Delegate to the pass executor so it can stream assistant responses,
 * process the final tool payload, and iterate plan/task execution until the
 * executor signals completion.
 */
export async function performResponseAndPlanSteps({
  initialPass,
  passContext,
}: {
  initialPass: number;
  passContext: PassExecutionContext;
}): Promise<void> {
  let currentPass = initialPass;
  let continueLoop = true;

  while (continueLoop) {
    const emitEvent = createPassScopedEmitEvent({
      emitEvent: passContext.baseOptions.emitEvent,
      passIndex: currentPass,
    });
    const shouldContinue = await passContext.passExecutor({
      ...passContext.baseOptions,
      emitEvent,
      passIndex: currentPass,
    });

    passContext.enforceMemoryPolicies(currentPass);

    if (!shouldContinue) {
      continueLoop = false;
    } else {
      currentPass = passContext.nextPass();
    }
  }
}

function createPassScopedEmitEvent({
  emitEvent,
  passIndex,
}: {
  emitEvent?: EmitEvent;
  passIndex: number;
}): EmitEvent {
  if (typeof emitEvent !== 'function') {
    return () => {};
  }

  let commandFallbackCounter = 0;

  const toStableString = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  };

  const extractPlanStep = (event: RuntimeEvent): unknown => {
    if (!event || typeof event !== 'object') {
      return null;
    }
    const directPlanStep = (event as { planStep?: unknown }).planStep;
    if (directPlanStep && typeof directPlanStep === 'object') {
      return directPlanStep;
    }
    const payload = (event as { payload?: unknown }).payload;
    if (payload && typeof payload === 'object') {
      const nestedPlanStep = (payload as { planStep?: unknown }).planStep;
      if (nestedPlanStep && typeof nestedPlanStep === 'object') {
        return nestedPlanStep;
      }
    }
    return null;
  };

  const resolveCommandId = (event: RuntimeEvent): string => {
    const planStepCandidate = extractPlanStep(event);
    if (planStepCandidate && typeof planStepCandidate === 'object') {
      const identifier = toStableString((planStepCandidate as { id?: unknown }).id);
      if (identifier) {
        return `pass-${passIndex}-command-${identifier}`;
      }
    }
    commandFallbackCounter += 1;
    return `pass-${passIndex}-command-${commandFallbackCounter}`;
  };

  const deriveStableId = (event: RuntimeEvent): string | null => {
    const type = typeof event?.type === 'string' ? event.type : null;
    if (!type) {
      return null;
    }
    switch (type) {
      case 'assistant-message':
        return `pass-${passIndex}-assistant-message`;
      case 'command-result':
        return resolveCommandId(event);
      case 'plan':
        return `pass-${passIndex}-plan`;
      case 'plan-progress':
        return `pass-${passIndex}-plan-progress`;
      case 'context-usage':
        return `pass-${passIndex}-context-usage`;
      default:
        return null;
    }
  };

  return (event: RuntimeEvent, options?: EmitRuntimeEventOptions): void => {
    const explicitId =
      options && typeof options.id === 'string' && options.id.length > 0 ? options.id : null;
    if (explicitId) {
      emitEvent(event, { id: explicitId });
      return;
    }
    const derivedId = deriveStableId(event);
    if (derivedId) {
      emitEvent(event, { id: derivedId });
      return;
    }
    emitEvent(event);
  };
}

function isExitCommand(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'exit' || normalized === 'quit';
}
