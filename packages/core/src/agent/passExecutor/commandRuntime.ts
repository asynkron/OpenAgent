import type { AgentCommandContext } from '../commandExecution.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { CommandResult } from '../observationBuilder.js';
import type { ApprovalManager } from '../approvalManager.js';
import type { CommandRunOutcome, ExecuteAgentPassOptions } from './types.js';
import type { ExecutableCandidate, PlanRuntime } from './planRuntime.js';
import { clonePlanForExecution } from './planExecution.js';

interface CommandRuntimeOptions {
  approvalManager: ApprovalManager | null;
  emitEvent: ExecuteAgentPassOptions['emitEvent'];
  emitAutoApproveStatus: boolean;
  runCommandFn: AgentCommandContext['runCommandFn'];
  executeAgentCommandFn: NonNullable<ExecuteAgentPassOptions['executeAgentCommandFn']>;
  incrementCommandCountFn: NonNullable<ExecuteAgentPassOptions['incrementCommandCountFn']>;
  observationBuilder: ObservationBuilder;
  planRuntime: PlanRuntime;
  emitDebug: (payload: unknown) => void;
}

const deriveCommandKey = (
  commandPayload: ExecutableCandidate['command'],
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

const executeCommandSafely = async (
  executeAgentCommandFn: CommandRuntimeOptions['executeAgentCommandFn'],
  runCommandFn: AgentCommandContext['runCommandFn'],
  commandPayload: ExecutableCandidate['command'],
  emitEvent: ExecuteAgentPassOptions['emitEvent'],
): Promise<CommandRunOutcome> => {
  try {
    return await executeAgentCommandFn({
      command: commandPayload,
      runCommandFn,
    });
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));

    emitEvent?.({
      type: 'status',
      level: 'error',
      message: 'Command execution threw an exception.',
      details: normalizedError.stack || normalizedError.message,
    });

    return {
      result: {
        stdout: '',
        stderr: normalizedError.message,
        exit_code: 1,
        killed: false,
        runtime_ms: 0,
      },
      executionDetails: {
        type: 'EXECUTE',
        command: commandPayload,
        error: {
          message: normalizedError.message,
          stack: normalizedError.stack,
        },
      },
    } satisfies CommandRunOutcome;
  }
};

const ensureCommandApproval = async (
  options: CommandRuntimeOptions,
  commandPayload: ExecutableCandidate['command'],
  planStep: ExecutableCandidate['step'] | null,
): Promise<'approved' | 'rejected'> => {
  const { approvalManager, emitAutoApproveStatus, emitEvent, planRuntime } = options;

  if (!approvalManager) {
    return 'approved';
  }

  const autoApproval = approvalManager.shouldAutoApprove(commandPayload);

  if (!autoApproval.approved) {
    const outcome = await approvalManager.requestHumanDecision({ command: commandPayload });

    if (outcome.decision === 'reject') {
      planRuntime.handleCommandRejection(planStep);
      return 'rejected';
    }

    emitEvent?.({
      type: 'status',
      level: 'info',
      message:
        outcome.decision === 'approve_session'
          ? 'Command approved for the remainder of the session.'
          : 'Command approved for single execution.',
    });

    return 'approved';
  }

  if (autoApproval.source === 'flag' && emitAutoApproveStatus) {
    emitEvent?.({
      type: 'status',
      level: 'info',
      message: 'Command auto-approved via flag.',
    });
  }

  return 'approved';
};

export class CommandRuntime {
  constructor(private readonly options: CommandRuntimeOptions) {}

  async execute(candidate: ExecutableCandidate): Promise<'continue' | 'stop'> {
    const { planStep, command, normalizedRun } = this.prepareCommand(candidate);

    const approvalResult = await ensureCommandApproval(this.options, command, planStep);
    if (approvalResult === 'rejected') {
      return 'stop';
    }

    const commandOutcome = await this.executeCommand(command, planStep);
    const commandResult = commandOutcome.result as CommandResult;

    await this.recordCommandStats(command, normalizedRun);
    await this.processCommandResult(command, commandResult, commandOutcome, planStep);

    return 'continue';
  }

  private prepareCommand(candidate: ExecutableCandidate) {
    const { step: planStepCandidate, command } = candidate;
    const planStep =
      planStepCandidate && typeof planStepCandidate === 'object' ? planStepCandidate : null;

    const normalizedRun = typeof command.run === 'string' ? command.run.trim() : '';
    if (normalizedRun && command.run !== normalizedRun) {
      command.run = normalizedRun;
    }

    return { planStep, command, normalizedRun };
  }

  private async executeCommand(
    command: ExecutableCandidate['command'],
    planStep: ExecutableCandidate['step'] | null,
  ) {
    this.options.planRuntime.markCommandRunning(planStep);
    this.options.planRuntime.emitPlanSnapshot();

    return await executeCommandSafely(
      this.options.executeAgentCommandFn,
      this.options.runCommandFn,
      command,
      this.options.emitEvent,
    );
  }

  private async recordCommandStats(command: ExecutableCandidate['command'], normalizedRun: string) {
    try {
      await this.options.incrementCommandCountFn(deriveCommandKey(command, normalizedRun));
    } catch (error) {
      this.options.emitEvent?.({
        type: 'status',
        level: 'warn',
        message: 'Failed to record command usage statistics.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processCommandResult(
    command: ExecutableCandidate['command'],
    commandResult: CommandResult,
    commandOutcome: CommandRunOutcome,
    planStep: ExecutableCandidate['step'] | null,
  ) {
    const { renderPayload, observation } = this.options.observationBuilder.build({
      command,
      result: commandResult,
    });

    this.options.planRuntime.applyCommandObservation({
      planStep,
      observation,
      commandResult,
    });

    this.options.emitDebug(() => ({
      stage: 'command-execution',
      command,
      result: commandOutcome.result,
      execution: commandOutcome.executionDetails,
      observation,
    }));

    this.options.emitEvent?.({
      type: 'command-result',
      command,
      result: commandResult,
      preview: renderPayload,
      execution: commandOutcome.executionDetails,
      planStep: planStep ? clonePlanForExecution([planStep])[0] ?? null : null,
    });

    this.options.planRuntime.emitPlanSnapshot();
  }
}

export const createCommandRuntime = (options: CommandRuntimeOptions): CommandRuntime =>
  new CommandRuntime(options);
