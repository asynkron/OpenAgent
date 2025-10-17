import type { AgentCommandContext } from '../commandExecution.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { ApprovalManager } from '../approvalManager.js';
import type { ExecuteAgentPassOptions } from './types.js';
import type { PlanRuntime } from './planRuntime.js';
import type { ExecutableCandidate } from './planRuntime.js';
import {
  prepareCommandCandidate,
  runApprovedCommand,
  type CommandExecutorOptions,
} from './commandRuntime/executor.js';
import {
  requestCommandApproval,
  type ApprovalGateOptions,
} from './commandRuntime/approvalGate.js';
import {
  processCommandExecution,
  type ResultProcessorOptions,
} from './commandRuntime/resultProcessor.js';
export type { CommandPipelineResult } from './commandRuntime/types.js';

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

export class CommandRuntime {
  private readonly approvalOptions: ApprovalGateOptions;
  private readonly executorOptions: CommandExecutorOptions;
  private readonly resultOptions: ResultProcessorOptions;

  constructor(private readonly options: CommandRuntimeOptions) {
    this.approvalOptions = {
      approvalManager: options.approvalManager,
      emitAutoApproveStatus: options.emitAutoApproveStatus,
      emitEvent: options.emitEvent,
      planRuntime: options.planRuntime,
    } satisfies ApprovalGateOptions;

    this.executorOptions = {
      executeAgentCommandFn: options.executeAgentCommandFn,
      runCommandFn: options.runCommandFn,
      emitEvent: options.emitEvent,
      planRuntime: options.planRuntime,
    } satisfies CommandExecutorOptions;

    this.resultOptions = {
      observationBuilder: options.observationBuilder,
      planRuntime: options.planRuntime,
      emitDebug: options.emitDebug,
      emitEvent: options.emitEvent,
      incrementCommandCountFn: options.incrementCommandCountFn,
    } satisfies ResultProcessorOptions;
  }

  async execute(candidate: ExecutableCandidate): Promise<'continue' | 'command-rejected'> {
    const prepared = prepareCommandCandidate(candidate);

    const approvalResult = await requestCommandApproval(this.approvalOptions, prepared);
    if (approvalResult.type === 'command-rejected') {
      return 'command-rejected';
    }

    const executionResult = await runApprovedCommand(this.executorOptions, approvalResult);
    const processed = await processCommandExecution(this.resultOptions, executionResult);

    return processed.type;
  }
}

export const createCommandRuntime = (options: CommandRuntimeOptions): CommandRuntime =>
  new CommandRuntime(options);
