// @ts-nocheck
/**
 * Assistant response parser that normalizes plan and command payloads.
 *
 * Responsibilities:
 * - Attempt multiple recovery strategies (direct JSON, fenced blocks, escaped newlines).
 * - Normalize nested command structures so downstream validators operate on a stable shape.
 *
 * Consumers:
 * - Pass executor after receiving a tool invocation from the model.
 *
 * Note: The runtime still imports the compiled `responseParser.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
const STRATEGY_DIRECT = 'direct' as const;
const STRATEGY_CODE_FENCE = 'code_fence' as const;
const STRATEGY_BALANCED_SLICE = 'balanced_slice' as const;
const STRATEGY_ESCAPED_NEWLINES = 'escaped_newlines' as const;

export type RecoveryStrategy =
  | typeof STRATEGY_DIRECT
  | typeof STRATEGY_CODE_FENCE
  | typeof STRATEGY_BALANCED_SLICE
  | typeof STRATEGY_ESCAPED_NEWLINES;

export interface ParseAttempt {
  strategy: RecoveryStrategy;
  error: unknown;
}

export interface ParseSuccess<T = AssistantPayload> {
  ok: true;
  value: T;
  normalizedText: string;
  recovery: { strategy: RecoveryStrategy };
}

export interface ParseFailure {
  ok: false;
  error: Error;
  attempts: ParseAttempt[];
}

export type ParseResult<T = AssistantPayload> = ParseSuccess<T> | ParseFailure;

export type JsonLikeObject = Record<string, unknown>;

export interface AssistantCommand extends JsonLikeObject {
  run?: unknown;
  cmd?: unknown;
  command_line?: unknown;
  shell?: unknown;
  filter_regex?: string;
  tail_lines?: number;
}

export interface PlanStep extends JsonLikeObject {
  command?: AssistantCommand | string | unknown[];
  age?: number;
  substeps?: PlanStep[];
  children?: PlanStep[];
  steps?: PlanStep[];
}

export interface AssistantPayload extends JsonLikeObject {
  command?: AssistantCommand | string | unknown[];
  plan?: PlanStep[];
}

function isPlainObject(value: unknown): value is JsonLikeObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmptyString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return '';
}

function escapeBareLineBreaks(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  if (!/(?:\r\n|\n|\r)/.test(input)) {
    return null;
  }

  return input.replace(/\r?\n/g, '\\n');
}

function normalizeFlatCommand(command: AssistantCommand): AssistantCommand {
  const runString = firstNonEmptyString(command.run, command.cmd, command.command_line);
  const shellString = firstNonEmptyString(command.shell);

  if (runString) {
    const {
      run: _ignoredRun,
      cmd: _ignoredCmd,
      command_line: _ignoredCommandLine,
      shell: _ignoredShell,
      ...rest
    } = command;
    const normalized: AssistantCommand = { ...rest, run: runString };
    if (shellString) {
      normalized.shell = shellString;
    }
    return normalized;
  }

  if (shellString) {
    const {
      shell: _ignoredShell,
      cmd: _ignoredCmd,
      command_line: _ignoredCommandLine,
      ...rest
    } = command;
    return { ...rest, run: shellString };
  }

  const { cmd: _ignoredCmd, command_line: _ignoredCommandLine, ...rest } = command;
  return { ...rest };
}

function normalizeNestedRunCommand(command: AssistantCommand): AssistantCommand {
  const nested = command.run;
  if (!isPlainObject(nested)) {
    return normalizeFlatCommand(command);
  }

  const {
    run: nestedRun,
    command: nestedCommand,
    cmd: nestedCmd,
    command_line: nestedCommandLine,
    shell: nestedShell,
    ...nestedRest
  } = nested as JsonLikeObject & AssistantCommand;
  const {
    run: _ignoredRun,
    cmd: topLevelCmd,
    command_line: topLevelCommandLine,
    shell: topLevelShell,
    ...rest
  } = command;

  const merged: AssistantCommand = { ...rest, ...nestedRest };
  const runString = firstNonEmptyString(
    nestedCommand,
    nestedRun,
    nestedCmd,
    nestedCommandLine,
    topLevelCmd,
    topLevelCommandLine,
  );
  const shellString = firstNonEmptyString(nestedShell, topLevelShell);

  if (runString) {
    merged.run = runString;
  } else if (shellString) {
    merged.run = shellString;
  }

  if (shellString && merged.run && shellString !== merged.run) {
    merged.shell = shellString;
  }

  return merged;
}

function normalizeNestedShellCommand(command: AssistantCommand): AssistantCommand {
  const nested = command.shell;
  if (!isPlainObject(nested)) {
    return normalizeFlatCommand(command);
  }

  const {
    command: nestedCommand,
    run: nestedRun,
    cmd: nestedCmd,
    command_line: nestedCommandLine,
    shell: nestedShell,
    ...nestedRest
  } = nested as JsonLikeObject & AssistantCommand;
  const {
    shell: _ignoredShell,
    cmd: topLevelCmd,
    command_line: topLevelCommandLine,
    ...rest
  } = command;

  const merged: AssistantCommand = { ...nestedRest, ...rest };
  const runString = firstNonEmptyString(
    rest.run,
    nestedCommand,
    nestedRun,
    nestedCmd,
    nestedCommandLine,
    topLevelCmd,
    topLevelCommandLine,
  );
  const shellString = firstNonEmptyString(nestedShell);

  if (runString) {
    merged.run = runString;
  }

  if (shellString && shellString !== merged.run) {
    merged.shell = shellString;
  }

  return merged;
}

function normalizeCommandPayload(
  command: AssistantPayload['command'],
): AssistantCommand | AssistantPayload['command'] {
  if (typeof command === 'string') {
    const trimmed = command.trim();
    if (!trimmed) {
      return {};
    }
    return { run: trimmed };
  }

  if (Array.isArray(command)) {
    const parts = command
      .map((part) => {
        if (typeof part === 'string') {
          return part.trim();
        }
        if (part === null || part === undefined) {
          return '';
        }
        return String(part).trim();
      })
      .filter((part) => part);

    if (parts.length === 0) {
      return {};
    }

    return { run: parts.join(' ') };
  }

  if (!isPlainObject(command)) {
    return command;
  }

  if (isPlainObject((command as AssistantCommand).run)) {
    return normalizeNestedRunCommand(command as AssistantCommand);
  }

  if (isPlainObject((command as AssistantCommand).shell)) {
    return normalizeNestedShellCommand(command as AssistantCommand);
  }

  return normalizeFlatCommand(command as AssistantCommand);
}

const CHILD_KEY = 'substeps' as const;

function normalizePlanStep(step: PlanStep): PlanStep {
  if (!isPlainObject(step)) {
    return step;
  }

  const normalizedStep: PlanStep = { ...step };

  if ('command' in normalizedStep) {
    normalizedStep.command = normalizeCommandPayload(normalizedStep.command);
  }

  if (!Number.isInteger(normalizedStep.age) || (normalizedStep.age as number) < 0) {
    normalizedStep.age = 0;
  }

  const candidate = Array.isArray(normalizedStep[CHILD_KEY])
    ? normalizedStep[CHILD_KEY]
    : Array.isArray((normalizedStep as PlanStep).children)
      ? (normalizedStep as PlanStep).children
      : Array.isArray((normalizedStep as PlanStep).steps)
        ? (normalizedStep as PlanStep).steps
        : null;

  if (candidate) {
    normalizedStep[CHILD_KEY] = candidate.map((child) => normalizePlanStep(child));
  } else if (CHILD_KEY in normalizedStep && !Array.isArray(normalizedStep[CHILD_KEY])) {
    delete normalizedStep[CHILD_KEY];
  }

  if ('children' in normalizedStep) {
    delete (normalizedStep as PlanStep).children;
  }
  if ('steps' in normalizedStep) {
    delete (normalizedStep as PlanStep).steps;
  }

  return normalizedStep;
}

function normalizePlan(plan: AssistantPayload['plan']): AssistantPayload['plan'] {
  if (!Array.isArray(plan)) {
    return plan;
  }

  return plan.map((step) => normalizePlanStep(step));
}

function normalizeAssistantPayload(
  payload: AssistantPayload | unknown,
): AssistantPayload | unknown {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const normalized: AssistantPayload = { ...(payload as AssistantPayload) };

  if ('command' in normalized) {
    normalized.command = normalizeCommandPayload(normalized.command);
  }

  if (Array.isArray(normalized.plan)) {
    normalized.plan = normalizePlan(normalized.plan);
  }

  return normalized;
}

const OPENING_TO_CLOSING = new Map<string, string>([
  ['{', '}'],
  ['[', ']'],
]);

const CLOSERS = new Set<string>(Array.from(OPENING_TO_CLOSING.values()));

function attemptParse(
  text: string,
  strategy: RecoveryStrategy,
  attempts: ParseAttempt[],
): ParseSuccess | null {
  try {
    const value = JSON.parse(text) as AssistantPayload;
    const normalizedValue = normalizeAssistantPayload(value);
    return {
      ok: true,
      value: normalizedValue as AssistantPayload,
      normalizedText: text,
      recovery: { strategy },
    };
  } catch (error) {
    attempts.push({ strategy, error });
    return null;
  }
}

function extractFromCodeFence(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const fenceMatch = input.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (!fenceMatch) {
    return null;
  }

  return fenceMatch[1]?.trim() ?? null;
}

function extractBalancedJson(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let startIndex = -1;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (OPENING_TO_CLOSING.has(char)) {
      if (stack.length === 0) {
        startIndex = index;
      }
      stack.push(OPENING_TO_CLOSING.get(char)!);
      continue;
    }

    if (CLOSERS.has(char)) {
      if (stack.length === 0) {
        continue;
      }

      const expected = stack.pop();
      if (char !== expected) {
        return null;
      }

      if (stack.length === 0 && startIndex !== -1) {
        return input.slice(startIndex, index + 1).trim();
      }
    }
  }

  return null;
}

export function parseAssistantResponse(rawContent: unknown): ParseResult {
  const attempts: ParseAttempt[] = [];

  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return {
      ok: false,
      error: new Error('Assistant response was empty or missing.'),
      attempts,
    };
  }

  const trimmed = rawContent.trim();

  const direct = attemptParse(trimmed, STRATEGY_DIRECT, attempts);
  if (direct) {
    return direct;
  }

  const escapedNewlines = escapeBareLineBreaks(trimmed);
  if (escapedNewlines) {
    const recovered = attemptParse(escapedNewlines, STRATEGY_ESCAPED_NEWLINES, attempts);
    if (recovered) {
      return recovered;
    }
  }

  const fenced = extractFromCodeFence(trimmed);
  if (fenced) {
    const recovered = attemptParse(fenced, STRATEGY_CODE_FENCE, attempts);
    if (recovered) {
      return recovered;
    }
  }

  const sliced = extractBalancedJson(trimmed);
  if (sliced) {
    const recovered = attemptParse(sliced, STRATEGY_BALANCED_SLICE, attempts);
    if (recovered) {
      return recovered;
    }
  }

  const primaryError = attempts[0]?.error;
  const messageParts = ['Failed to parse assistant JSON response.'];
  if (primaryError && typeof (primaryError as Error).message === 'string') {
    messageParts.push((primaryError as Error).message);
  }

  return {
    ok: false,
    error: new Error(messageParts.join(' ')),
    attempts,
  };
}

export default {
  parseAssistantResponse,
};
