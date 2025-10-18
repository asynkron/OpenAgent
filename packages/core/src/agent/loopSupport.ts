import { QUEUE_DONE } from '../utils/asyncQueue.js';
import type {
  AgentInputEvent,
  AsyncQueueLike,
  HistorySnapshot,
  RuntimeEvent,
} from './runtimeTypes.js';
import type { ExecuteAgentPassOptions } from './passExecutor.js';
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
  emit: (event: RuntimeEvent) => void;
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
  emit: (event: RuntimeEvent) => void;
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
      type: 'error',
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
  emit: (event: RuntimeEvent) => void;
  getAutoApproveFlag: () => boolean;
  getNoHumanFlag: () => boolean;
}): void {
  emit({
    type: 'banner',
    payload: {
      title: 'OpenAgent - AI Agent with JSON Protocol',
      subtitle: null,
    },
  });
  emit({
    type: 'status',
    payload: {
      level: 'info',
      message: 'Submit prompts to drive the conversation.',
      details: null,
    },
  });
  if (getAutoApproveFlag()) {
    emit({
      type: 'status',
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
      type: 'status',
      payload: {
        level: 'warn',
        message:
          "No-human mode enabled (--nohuman). Agent will auto-respond with \"continue or say 'done'\" until the AI replies \"done\".",
        details: null,
      },
    });
  }
}

export function createThinkingController(emit: (event: RuntimeEvent) => void): {
  start: () => void;
  stop: () => void;
} {
  return {
    start: () => emit({ type: 'thinking', payload: { state: 'start' } }),
    stop: () => emit({ type: 'thinking', payload: { state: 'stop' } }),
  };
}

export async function runConversationLoop(context: ConversationLoopContext): Promise<void> {
  while (true) {
    const decision = await fetchUserInputDecision({
      promptCoordinator: context.promptCoordinator,
      getNoHumanFlag: context.getNoHumanFlag,
      noHumanAutoMessage: context.noHumanAutoMessage,
      userInputPrompt: context.userInputPrompt,
    });

    if (decision.kind === 'exit') {
      context.emit({
        type: 'status',
        payload: {
          level: 'info',
          message: 'Goodbye!',
          details: null,
        },
      });
      break;
    }

    if (decision.kind === 'skip') {
      continue;
    }

    const activePass = context.passContext.nextPass();

    context.history.push(
      context.createChatMessageEntryFn({
        eventType: 'chat-message',
        role: 'user',
        content: decision.value,
        pass: activePass,
      }),
    );

    context.enforceMemoryPolicies(activePass);

    try {
      await executePassSequence({
        initialPass: activePass,
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

type UserInputDecision = { kind: 'exit' } | { kind: 'skip' } | { kind: 'input'; value: string };

async function fetchUserInputDecision({
  promptCoordinator,
  getNoHumanFlag,
  noHumanAutoMessage,
  userInputPrompt,
}: {
  promptCoordinator: PromptCoordinatorLike;
  getNoHumanFlag: () => boolean;
  noHumanAutoMessage: string;
  userInputPrompt: string;
}): Promise<UserInputDecision> {
  const noHumanActive = getNoHumanFlag();
  const userInput = noHumanActive
    ? noHumanAutoMessage
    : await promptCoordinator.request(userInputPrompt, { scope: 'user-input' });

  if (!userInput) {
    return { kind: 'skip' };
  }

  if (isExitCommand(userInput)) {
    return { kind: 'exit' };
  }

  return { kind: 'input', value: userInput };
}

async function executePassSequence({
  initialPass,
  passContext,
}: {
  initialPass: number;
  passContext: PassExecutionContext;
}): Promise<void> {
  let currentPass = initialPass;
  let continueLoop = true;

  while (continueLoop) {
    const shouldContinue = await passContext.passExecutor({
      ...passContext.baseOptions,
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

function isExitCommand(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'exit' || normalized === 'quit';
}
