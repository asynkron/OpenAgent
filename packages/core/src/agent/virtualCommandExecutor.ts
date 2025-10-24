import { RuntimeEventType } from '../contracts/events.js';
import type { CommandExecutionResult } from './commandExecution.js';
import type {
  VirtualCommandDescriptor,
  VirtualCommandExecutionContext,
  VirtualCommandExecutor,
} from './commandExecution.js';
import { createChatMessageEntry } from './historyEntry.js';
import type { ChatMessageEntry } from './historyEntry.js';
import type { PassExecutionBaseOptions, PassExecutor } from './loopSupport.js';
import type { PlanHistory } from './passExecutor/types.js';
import type { EmitEvent } from './passExecutor/types.js';
import type { DebugRuntimeEventPayload } from './runtimeTypes.js';

interface VirtualAgentExecutorConfig {
  readonly systemPrompt: string;
  readonly baseOptions: PassExecutionBaseOptions;
  readonly passExecutor: PassExecutor;
  readonly createChatMessageEntryFn: typeof createChatMessageEntry;
  readonly emitEvent: EmitEvent;
  readonly emitDebug: (payload: DebugRuntimeEventPayload) => void;
}

interface ParsedVirtualDescriptor {
  readonly prompt: string;
  readonly summary: string;
  readonly maxPasses: number;
}

const DEFAULT_MAX_PASSES = 3;

const clampPassLimit = (value: number): number => {
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_PASSES;
  }
  const upperBound = 10;
  if (value > upperBound) {
    return upperBound;
  }
  return Math.floor(value);
};

const parseJsonArgument = (raw: string): ParsedVirtualDescriptor | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const promptCandidate = (parsed as { prompt?: unknown; goal?: unknown; task?: unknown }).prompt
      ?? (parsed as { goal?: unknown }).goal
      ?? (parsed as { task?: unknown }).task;
    const summaryCandidate = (parsed as { summary?: unknown; title?: unknown; label?: unknown }).summary
      ?? (parsed as { title?: unknown }).title
      ?? (parsed as { label?: unknown }).label;
    const maxCandidate = (parsed as { maxPasses?: unknown; max_passes?: unknown }).maxPasses
      ?? (parsed as { max_passes?: unknown }).max_passes;

    const prompt = typeof promptCandidate === 'string' ? promptCandidate.trim() : '';
    const summary = typeof summaryCandidate === 'string' ? summaryCandidate.trim() : '';
    const maxPasses = typeof maxCandidate === 'number' ? clampPassLimit(maxCandidate) : DEFAULT_MAX_PASSES;

    return {
      prompt: prompt || '',
      summary: summary || '',
      maxPasses,
    } satisfies ParsedVirtualDescriptor;
  } catch (error) {
    return null;
  }
};

const parseDescriptor = (descriptor: VirtualCommandDescriptor): ParsedVirtualDescriptor => {
  const defaultSummary = descriptor.action ? `Virtual agent: ${descriptor.action}` : 'Virtual agent task';
  const rawArgument = typeof descriptor.argument === 'string' ? descriptor.argument.trim() : '';

  if (!rawArgument) {
    return {
      prompt: `Carry out the requested action and return a concise summary of results. (${defaultSummary})`,
      summary: defaultSummary,
      maxPasses: DEFAULT_MAX_PASSES,
    } satisfies ParsedVirtualDescriptor;
  }

  if (rawArgument.startsWith('{')) {
    const parsed = parseJsonArgument(rawArgument);
    if (parsed) {
      return {
        prompt:
          parsed.prompt
            || `Carry out the requested action and report findings. (${defaultSummary})`,
        summary: parsed.summary || defaultSummary,
        maxPasses: parsed.maxPasses,
      } satisfies ParsedVirtualDescriptor;
    }
  }

  return {
    prompt: rawArgument,
    summary: defaultSummary,
    maxPasses: DEFAULT_MAX_PASSES,
  } satisfies ParsedVirtualDescriptor;
};

const buildInitialHistory = (
  config: VirtualAgentExecutorConfig,
  parsed: ParsedVirtualDescriptor,
): PlanHistory => {
  const history: ChatMessageEntry[] = [];

  history.push(
    config.createChatMessageEntryFn({
      eventType: 'chat-message',
      role: 'system',
      content: config.systemPrompt,
      pass: 0,
    }),
  );

  history.push(
    config.createChatMessageEntryFn({
      eventType: 'chat-message',
      role: 'user',
      content: parsed.prompt,
      pass: 1,
    }),
  );

  return history;
};

const cloneBaseOptions = (
  config: VirtualAgentExecutorConfig,
  history: PlanHistory,
): PassExecutionBaseOptions => {
  const base = config.baseOptions;
  const cloned: PassExecutionBaseOptions = {
    openai: base.openai,
    model: base.model,
    history,
    emitEvent: config.emitEvent,
    onDebug: base.onDebug ?? null,
    runCommandFn: base.runCommandFn,
    applyFilterFn: base.applyFilterFn,
    tailLinesFn: base.tailLinesFn,
    getNoHumanFlag: () => false,
    setNoHumanFlag: () => undefined,
    planReminderMessage: base.planReminderMessage,
    startThinkingFn: () => {},
    stopThinkingFn: () => {},
    escState: null,
    approvalManager: null,
    historyCompactor: null,
    planManager: null,
    planAutoResponseTracker: null,
    emitAutoApproveStatus: false,
  } satisfies PassExecutionBaseOptions;

  if (typeof base.requestModelCompletionFn === 'function') {
    cloned.requestModelCompletionFn = base.requestModelCompletionFn;
  }
  if (typeof base.executeAgentCommandFn === 'function') {
    cloned.executeAgentCommandFn = base.executeAgentCommandFn;
  }
  cloned.virtualCommandExecutor = null;
  if (typeof base.createObservationBuilderFn === 'function') {
    cloned.createObservationBuilderFn = base.createObservationBuilderFn;
  }
  if (typeof base.combineStdStreamsFn === 'function') {
    cloned.combineStdStreamsFn = base.combineStdStreamsFn;
  }
  if (typeof base.buildPreviewFn === 'function') {
    cloned.buildPreviewFn = base.buildPreviewFn;
  }
  if (typeof base.parseAssistantResponseFn === 'function') {
    cloned.parseAssistantResponseFn = base.parseAssistantResponseFn;
  }
  if (typeof base.validateAssistantResponseSchemaFn === 'function') {
    cloned.validateAssistantResponseSchemaFn = base.validateAssistantResponseSchemaFn;
  }
  if (typeof base.validateAssistantResponseFn === 'function') {
    cloned.validateAssistantResponseFn = base.validateAssistantResponseFn;
  }
  cloned.createChatMessageEntryFn = config.createChatMessageEntryFn;
  if (typeof base.extractOpenAgentToolCallFn === 'function') {
    cloned.extractOpenAgentToolCallFn = base.extractOpenAgentToolCallFn;
  }
  if (typeof base.summarizeContextUsageFn === 'function') {
    cloned.summarizeContextUsageFn = base.summarizeContextUsageFn;
  }
  if (typeof base.incrementCommandCountFn === 'function') {
    cloned.incrementCommandCountFn = base.incrementCommandCountFn;
  }
  cloned.guardRequestPayloadSizeFn = null;
  cloned.recordRequestPayloadSizeFn = null;

  return cloned;
};

const collectAssistantMessages = (history: PlanHistory): string[] => {
  const outputs: string[] = [];
  for (const entry of history) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const payload = (entry as { payload?: unknown }).payload;
    if (!payload || typeof payload !== 'object') {
      continue;
    }
    const role = (payload as { role?: unknown }).role;
    if (role !== 'assistant') {
      continue;
    }
    const content = (payload as { content?: unknown }).content;
    if (typeof content === 'string' && content.trim()) {
      outputs.push(content.trim());
    }
  }
  return outputs;
};

const buildResult = (
  command: VirtualCommandExecutionContext['command'],
  descriptor: VirtualCommandDescriptor,
  history: PlanHistory,
  passesExecuted: number,
  maxPasses: number,
  failure: string | null,
  runtimeMs: number,
): CommandExecutionResult => {
  const assistantOutputs = collectAssistantMessages(history);
  const stdout = assistantOutputs.length > 0 ? assistantOutputs.join('\n\n---\n\n') : '';
  const success = !failure && stdout.length > 0;

  const normalizedFailure = success ? null : failure ?? 'Virtual agent did not produce a response.';

  const result = {
    stdout: success ? stdout : '',
    stderr: normalizedFailure ?? '',
    exit_code: success ? 0 : 1,
    killed: false,
    runtime_ms: runtimeMs,
  } satisfies CommandExecutionResult['result'];

  const executionDetails: CommandExecutionResult['executionDetails'] = {
    type: 'VIRTUAL',
    command,
  };

  if (normalizedFailure) {
    executionDetails.error = { message: normalizedFailure };
  }

  (executionDetails as { virtualAgent?: { passesExecuted: number; maxPasses: number; action: string; argument: string } }).virtualAgent = {
    passesExecuted,
    maxPasses,
    action: descriptor.action,
    argument: descriptor.argument,
  };

  return { result, executionDetails } satisfies CommandExecutionResult;
};

export const createVirtualCommandExecutor = (
  config: VirtualAgentExecutorConfig,
): VirtualCommandExecutor => {
  return async (context: VirtualCommandExecutionContext): Promise<CommandExecutionResult> => {
    const parsed = parseDescriptor(context.descriptor);
    config.emitDebug({
      stage: 'command-execution',
      command: context.command,
      result: null,
      execution: { type: 'VIRTUAL', command: context.command },
      observation: null,
    });

    config.emitEvent({
      type: RuntimeEventType.Status,
      payload: {
        level: 'info',
        message: `Launching virtual agent task (${parsed.summary}).`,
        details: null,
      },
    });

    const history = buildInitialHistory(config, parsed);
    const subAgentOptions = cloneBaseOptions(config, history);

    let passIndex = 1;
    let passesExecuted = 0;
    let continueLoop = true;
    let failure: string | null = null;
    const startedAt = Date.now();

    while (continueLoop && passesExecuted < parsed.maxPasses) {
      try {
        const shouldContinue = await config.passExecutor({
          ...subAgentOptions,
          passIndex,
        });
        if (!shouldContinue) {
          continueLoop = false;
        } else {
          passIndex += 1;
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        continueLoop = false;
      }
      passesExecuted += 1;
    }

    if (continueLoop) {
      failure = `Virtual agent reached the maximum of ${parsed.maxPasses} passes without completing.`;
    }

    const runtimeMs = Date.now() - startedAt;
    const commandResult = buildResult(
      context.command,
      context.descriptor,
      history,
      passesExecuted,
      parsed.maxPasses,
      failure,
      runtimeMs,
    );

    const success = commandResult.result.exit_code === 0;

    config.emitEvent({
      type: RuntimeEventType.Status,
      payload: {
        level: success ? 'info' : 'error',
        message: success
          ? `Virtual agent task (${parsed.summary}) completed successfully.`
          : `Virtual agent task (${parsed.summary}) failed.`,
        details: success ? null : commandResult.result.stderr,
      },
    });

    config.emitDebug({
      stage: 'command-execution',
      command: context.command,
      result: commandResult.result,
      execution: commandResult.executionDetails,
      observation: null,
    });

    return commandResult;
  };
};

export default { createVirtualCommandExecutor };

