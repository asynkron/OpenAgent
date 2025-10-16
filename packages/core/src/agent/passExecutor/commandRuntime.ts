import type { AgentCommandContext } from '../commandExecution.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { ApprovalManager } from '../approvalManager.js';
import type { ExecuteAgentPassOptions } from './types.js';
import type { ExecutableCandidate, PlanRuntime } from './planRuntime.js';
import {
  ensureCommandApproval,
  type CommandApprovalDependencies,
} from './commandRuntime/approval.js';
import {
  executeCommandSafely,
  type SafeExecutionDependencies,
} from './commandRuntime/safeExecution.js';
import {
  recordCommandStats,
  type CommandStatsDependencies,
} from './commandRuntime/statsTracker.js';
import {
  emitCommandResult,
  type ResultEmitterDependencies,
} from './commandRuntime/resultEmitter.js';
import type {
  CommandRuntimeResult,
  PreparedCommand,
} from './commandRuntime/types.js';

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

const prepareCommand = (candidate: ExecutableCandidate): PreparedCommand => {
  const planStepCandidate = candidate.step;
  const planStep = planStepCandidate && typeof planStepCandidate === 'object' ? planStepCandidate : null;

  const command = candidate.command;
  const normalizedRun = typeof command.run === 'string' ? command.run.trim() : '';

  if (normalizedRun && command.run !== normalizedRun) {
    command.run = normalizedRun;
  }

  return { command, planStep, normalizedRun } satisfies PreparedCommand;
};

export class CommandRuntime {
  constructor(private readonly options: CommandRuntimeOptions) {}

  async execute(candidate: ExecutableCandidate): Promise<CommandRuntimeResult> {
    const prepared = prepareCommand(candidate);

    const approval = await ensureCommandApproval(this.buildApprovalDependencies(), prepared);
    if (approval.status === 'rejected') {
      return approval;
    }

    this.options.planRuntime.markCommandRunning(approval.planStep);
    this.options.planRuntime.emitPlanSnapshot();

    const execution = await executeCommandSafely(this.buildExecutionDependencies(), approval);
    const stats = await recordCommandStats(this.buildStatsDependencies(), execution);
    const emission = emitCommandResult(this.buildResultDependencies(), execution);

    return {
      status: 'executed',
      approval,
      execution,
      stats,
      emission,
    };
  }

  private buildApprovalDependencies(): CommandApprovalDependencies {
    return {
      approvalManager: this.options.approvalManager,
      emitEvent: this.options.emitEvent,
      emitAutoApproveStatus: this.options.emitAutoApproveStatus,
      planRuntime: this.options.planRuntime,
    } satisfies CommandApprovalDependencies;
  }

  private buildExecutionDependencies(): SafeExecutionDependencies {
    return {
      executeAgentCommandFn: this.options.executeAgentCommandFn,
      runCommandFn: this.options.runCommandFn,
      emitEvent: this.options.emitEvent,
    } satisfies SafeExecutionDependencies;
  }

  private buildStatsDependencies(): CommandStatsDependencies {
    return {
      incrementCommandCountFn: this.options.incrementCommandCountFn,
      emitEvent: this.options.emitEvent,
    } satisfies CommandStatsDependencies;
  }

  private buildResultDependencies(): ResultEmitterDependencies {
    return {
      observationBuilder: this.options.observationBuilder,
      planRuntime: this.options.planRuntime,
      emitEvent: this.options.emitEvent,
      emitDebug: this.options.emitDebug,
    } satisfies ResultEmitterDependencies;
  }
}

export const createCommandRuntime = (options: CommandRuntimeOptions): CommandRuntime =>
  new CommandRuntime(options);

export type { CommandRuntimeResult } from './commandRuntime/types.js';
