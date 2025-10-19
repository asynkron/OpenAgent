import { deepCloneValue } from '../../../utils/planCloneUtils.js';
import { buildPlanStepSnapshot } from '../planSnapshot.js';
import type ObservationBuilder from '../../observationBuilder.js';
import type { ExecuteAgentPassOptions } from '../types.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { CommandExecutedResult, CommandContinueResult } from './types.js';
import type { EmitRuntimeEventOptions, RuntimeDebugPayload } from '../../runtimeTypes.js';
import type { PlanSnapshotStep } from '../../../utils/plan.js';
import type { CommandDraft } from '../../../contracts/index.js';
import type { CommandResult } from '../../../commands/run.js';
import type { PlanHistorySnapshot } from '../planSnapshot.js';

export interface ResultProcessorOptions {
  readonly observationBuilder: ObservationBuilder;
  readonly planRuntime: PlanRuntime;
  readonly emitDebug: (payload: RuntimeDebugPayload) => void;
  readonly emitEvent: ExecuteAgentPassOptions['emitEvent'];
  readonly incrementCommandCountFn: NonNullable<ExecuteAgentPassOptions['incrementCommandCountFn']>;
}

const deriveCommandKey = (
  commandPayload: CommandExecutedResult['command'],
  normalizedRun: string,
): string => {
  if (typeof commandPayload.key === 'string') {
    const trimmed = commandPayload.key.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (normalizedRun) {
    const [firstToken] = normalizedRun.split(/\s+/);
    if (firstToken) {
      return firstToken;
    }
  }

  return 'unknown';
};

const recordCommandStats = async (
  options: ResultProcessorOptions,
  executed: CommandExecutedResult,
): Promise<void> => {
  try {
    await options.incrementCommandCountFn(
      deriveCommandKey(executed.command, executed.normalizedRun),
    );
  } catch (error) {
    options.emitEvent?.({
      type: 'status',
      payload: {
        level: 'warn',
        message: 'Failed to record command usage statistics.',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
};

const sanitizeCommand = (command: CommandExecutedResult['command'] | null): CommandDraft | null => {
  if (!command || typeof command !== 'object') {
    return null;
  }

  const ensureString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;
  const ensureNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const sanitized: CommandDraft = {};

  const reason = ensureString(command.reason);
  if (reason !== undefined) sanitized.reason = reason;
  const shell = ensureString(command.shell);
  if (shell !== undefined) sanitized.shell = shell;
  const run = ensureString(command.run);
  if (run !== undefined) sanitized.run = run;
  const cwd = ensureString(command.cwd);
  if (cwd !== undefined) sanitized.cwd = cwd;
  const timeout = ensureNumber(command.timeout_sec);
  if (timeout !== undefined) sanitized.timeout_sec = timeout;
  const filterRegex = ensureString(command.filter_regex);
  if (filterRegex !== undefined) sanitized.filter_regex = filterRegex;
  const tailLines = ensureNumber(command.tail_lines);
  if (tailLines !== undefined) sanitized.tail_lines = tailLines;
  const maxBytes = ensureNumber(command.max_bytes);
  if (maxBytes !== undefined) sanitized.max_bytes = maxBytes;

  return sanitized;
};

const sanitizeResult = (result: CommandResult): CommandResult => ({
  stdout: result.stdout,
  stderr: result.stderr,
  exit_code: result.exit_code,
  killed: result.killed,
  runtime_ms: result.runtime_ms,
});

const sanitizePlanStep = (planStep: CommandExecutedResult['planStep']): PlanSnapshotStep | null => {
  if (!planStep) {
    return null;
  }

  return deepCloneValue(planStep) as PlanSnapshotStep;
};

const sanitizePlanSnapshot = (
  planStep: CommandExecutedResult['planStep'],
): PlanHistorySnapshot | null => {
  if (!planStep) {
    return null;
  }

  return buildPlanStepSnapshot(planStep);
};

const isPlanStepCompleted = (planStep: PlanSnapshotStep | null): boolean => {
  if (!planStep || typeof planStep !== 'object') {
    return false;
  }

  const statusCandidate = (planStep as { status?: unknown }).status;
  if (typeof statusCandidate !== 'string') {
    return false;
  }

  const normalized = statusCandidate.trim().toLowerCase();
  return normalized === 'completed';
};

export const processCommandExecution = async (
  options: ResultProcessorOptions,
  executed: CommandExecutedResult,
): Promise<CommandContinueResult> => {
  await recordCommandStats(options, executed);

  const { renderPayload, observation } = options.observationBuilder.build({
    command: executed.command,
    result: executed.result,
  });

  options.planRuntime.applyCommandObservation({
    planStep: executed.planStep,
    observation,
    commandResult: executed.result,
  });

  const sanitizedCommand = sanitizeCommand(executed.command ?? null);
  const sanitizedResult = sanitizeResult(executed.result);
  const sanitizedExecution = deepCloneValue(executed.outcome.executionDetails);
  const sanitizedObservation = deepCloneValue(observation);
  const sanitizedPlanStep = sanitizePlanStep(executed.planStep ?? null);
  const sanitizedPlanSnapshot = sanitizePlanSnapshot(executed.planStep ?? null);
  const sanitizedPreview = deepCloneValue(renderPayload);

  options.emitDebug(() => ({
    stage: 'command-execution',
    command: sanitizedCommand,
    result: sanitizedResult,
    execution: sanitizedExecution,
    observation: sanitizedObservation,
  }));

  const commandResultEvent = {
    type: 'command-result',
    payload: {
      command: sanitizedCommand,
      result: sanitizedResult,
      preview: sanitizedPreview,
      execution: sanitizedExecution,
      observation: sanitizedObservation,
      planStep: sanitizedPlanStep,
      planSnapshot: sanitizedPlanSnapshot,
    },
    command: sanitizedCommand,
    result: sanitizedResult,
    preview: sanitizedPreview,
    execution: sanitizedExecution,
    observation: sanitizedObservation,
    planStep: sanitizedPlanStep,
    planSnapshot: sanitizedPlanSnapshot,
  } as unknown as Parameters<NonNullable<typeof options.emitEvent>>[0];

  const emitOptions: EmitRuntimeEventOptions | undefined = isPlanStepCompleted(sanitizedPlanStep)
    ? { final: true }
    : undefined;

  options.emitEvent?.(commandResultEvent, emitOptions);

  const snapshotEffect = options.planRuntime.emitPlanSnapshot();
  options.planRuntime.applyEffects([snapshotEffect]);

  return { type: 'continue' } satisfies CommandContinueResult;
};
