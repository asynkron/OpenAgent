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
import type { DebugRuntimeEventPayload, EmitRuntimeEventOptions } from './runtimeTypes.js';

interface ObservationSummary {
  readonly summary: string | null;
  readonly details: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly truncated: boolean;
  readonly truncationNotice: string | null;
}

interface VirtualAgentFindings {
  readonly assistantMessages: string[];
  readonly observations: ObservationSummary[];
}

interface VirtualAgentExecutorConfig {
  readonly systemPrompt: string;
  readonly baseOptions: PassExecutionBaseOptions;
  readonly passExecutor: PassExecutor;
  readonly createChatMessageEntryFn: typeof createChatMessageEntry;
  readonly emitEvent: EmitEvent;
  readonly emitDebug: (payload: DebugRuntimeEventPayload, options?: EmitRuntimeEventOptions) => void;
  readonly createSubAgentLabel: () => string;
}

interface ParsedVirtualDescriptor {
  readonly prompt: string;
  readonly summary: string;
  readonly maxPasses: number;
}

// Default to ten passes when the caller does not specify a limit.
const DEFAULT_MAX_PASSES = 10;

const normalizePassLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_PASSES;
  }
  const floored = Math.floor(value);
  if (floored < 1) {
    return DEFAULT_MAX_PASSES;
  }
  return floored;
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
    const maxPasses = typeof maxCandidate === 'number' ? normalizePassLimit(maxCandidate) : DEFAULT_MAX_PASSES;

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

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const parseObservationContent = (raw: string): ObservationSummary | null => {
  try {
    const parsed = JSON.parse(raw) as {
      type?: unknown;
      payload?: unknown;
      summary?: unknown;
      details?: unknown;
    } | null;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const typeValue = toTrimmedString(parsed.type);
    if (typeValue !== 'observation') {
      return null;
    }

    const payloadCandidate = parsed.payload as {
      stdout?: unknown;
      stderr?: unknown;
      exit_code?: unknown;
      truncated?: unknown;
      truncation_notice?: unknown;
      summary?: unknown;
      details?: unknown;
    } | null;

    if (!payloadCandidate || typeof payloadCandidate !== 'object') {
      return null;
    }

    const summary = toTrimmedString(parsed.summary)
      ?? toTrimmedString(payloadCandidate.summary)
      ?? null;
    const details = toTrimmedString(parsed.details)
      ?? toTrimmedString(payloadCandidate.details)
      ?? null;
    const stdout = typeof payloadCandidate.stdout === 'string' ? payloadCandidate.stdout : '';
    const stderr = typeof payloadCandidate.stderr === 'string' ? payloadCandidate.stderr : '';
    const exitCode = toFiniteNumber(payloadCandidate.exit_code);
    const truncationNotice = toTrimmedString(payloadCandidate.truncation_notice);
    const truncated = payloadCandidate.truncated === true;

    return {
      summary,
      details,
      stdout,
      stderr,
      exitCode,
      truncated,
      truncationNotice,
    } satisfies ObservationSummary;
  } catch (error) {
    return null;
  }
};

const collectFindings = (history: PlanHistory): VirtualAgentFindings => {
  const assistantMessages: string[] = [];
  const observations: ObservationSummary[] = [];

  for (const entry of history) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const payload = entry.payload as {
      role?: unknown;
      content?: unknown;
    } | undefined;

    if (!payload || typeof payload !== 'object') {
      continue;
    }

    const role = toTrimmedString(payload.role);
    if (role === 'assistant') {
      const content = toTrimmedString(payload.content);
      if (content) {
        assistantMessages.push(content);
      }
      continue;
    }

    const contentValue = payload.content;
    if (typeof contentValue === 'string') {
      const observation = parseObservationContent(contentValue);
      if (observation) {
        observations.push(observation);
      }
      continue;
    }

    if (
      contentValue &&
      typeof contentValue === 'object'
    ) {
      const serialized = JSON.stringify(contentValue);
      const observation = parseObservationContent(serialized);
      if (observation) {
        observations.push(observation);
      }
    }
  }

  return { assistantMessages, observations } satisfies VirtualAgentFindings;
};

const indentBlock = (text: string): string =>
  text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

const formatObservation = (
  observation: ObservationSummary,
  index: number,
  total: number,
): string => {
  const lines: string[] = [];
  const headingPrefix = total > 1 ? `${index + 1}. ` : '';
  const headingBody = observation.summary ?? 'Command result';
  lines.push(`${headingPrefix}${headingBody}`);

  if (typeof observation.exitCode === 'number') {
    lines.push(`   Exit code: ${observation.exitCode}`);
  }

  const trimmedStdout = observation.stdout.trim();
  if (trimmedStdout.length > 0) {
    lines.push('   Stdout:');
    lines.push(indentBlock(trimmedStdout));
  }

  const trimmedStderr = observation.stderr.trim();
  if (trimmedStderr.length > 0) {
    lines.push('   Stderr:');
    lines.push(indentBlock(trimmedStderr));
  }

  if (observation.truncated) {
    const notice = observation.truncationNotice ?? 'Output truncated.';
    lines.push(`   Notice: ${notice}`);
  } else if (observation.truncationNotice) {
    lines.push(`   Notice: ${observation.truncationNotice}`);
  }

  if (observation.details) {
    lines.push(`   Details: ${observation.details}`);
  }

  return lines.join('\n');
};

const buildStdoutFromFindings = (
  taskLabel: string,
  findings: VirtualAgentFindings,
): string => {
  const sections: string[] = [];
  const assistantCount = findings.assistantMessages.length;
  const summaryText =
    assistantCount > 0
      ? findings.assistantMessages[assistantCount - 1]
      : 'No assistant summary was produced. Review command results below.';

  const summarySection = [`Summary for "${taskLabel}":`, summaryText].join('\n');
  sections.push(summarySection);

  if (findings.observations.length > 0) {
    const observationLines: string[] = [];
    observationLines.push('Command Results:');
    for (let index = 0; index < findings.observations.length; index += 1) {
      const formatted = formatObservation(findings.observations[index], index, findings.observations.length);
      observationLines.push(formatted);
    }
    sections.push(observationLines.join('\n'));
  }

  return sections.join('\n\n').trim();
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
    getDebugFlag: () => false,
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
  if (typeof base.getNoHumanFlag === 'function') {
    cloned.getNoHumanFlag = base.getNoHumanFlag;
  }
  if (typeof base.getDebugFlag === 'function') {
    cloned.getDebugFlag = base.getDebugFlag;
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

const buildResult = (
  command: VirtualCommandExecutionContext['command'],
  descriptor: VirtualCommandDescriptor,
  history: PlanHistory,
  passesExecuted: number,
  maxPasses: number,
  taskLabel: string,
  failure: string | null,
  runtimeMs: number,
): CommandExecutionResult => {
  const findings = collectFindings(history);
  const hasResults = findings.assistantMessages.length > 0 || findings.observations.length > 0;
  const normalizedFailure = !failure && hasResults
    ? null
    : failure ?? 'Virtual agent did not produce a response.';
  const stdout = normalizedFailure ? '' : buildStdoutFromFindings(taskLabel, findings);
  const success = normalizedFailure === null && stdout.length > 0;

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
    const agentLabel = config.createSubAgentLabel();
    const emitEventWithAgent: EmitEvent = (event, options) =>
      config.emitEvent(event, { ...options, agent: agentLabel });
    const emitDebugWithAgent: typeof config.emitDebug = (payload, options) =>
      config.emitDebug(payload, { ...options, agent: agentLabel });

    const parsed = parseDescriptor(context.descriptor);
    emitDebugWithAgent({
      stage: 'command-execution',
      command: context.command,
      result: null,
      execution: { type: 'VIRTUAL', command: context.command },
      observation: null,
    });

    emitEventWithAgent({
      type: RuntimeEventType.Status,
      payload: {
        level: 'info',
        message: `Launching virtual agent task (${parsed.summary}).`,
        details: null,
      },
    });

    const history = buildInitialHistory(config, parsed);
    const subAgentOptions = cloneBaseOptions(config, history);
    subAgentOptions.emitEvent = emitEventWithAgent;
    subAgentOptions.onDebug = (payload) => emitDebugWithAgent(payload);

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
      parsed.summary,
      failure,
      runtimeMs,
    );

    const success = commandResult.result.exit_code === 0;

    emitEventWithAgent({
      type: RuntimeEventType.Status,
      payload: {
        level: success ? 'info' : 'error',
        message: success
          ? `Virtual agent task (${parsed.summary}) completed successfully.`
          : `Virtual agent task (${parsed.summary}) failed.`,
        details: success ? null : commandResult.result.stderr,
      },
    });

    emitDebugWithAgent({
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

