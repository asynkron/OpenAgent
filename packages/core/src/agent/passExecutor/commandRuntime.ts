import type { AgentCommandContext } from '../commandExecution.js';
import type ObservationBuilder from '../observationBuilder.js';
import type { ApprovalManager } from '../approvalManager.js';
import {
  createEscWaiter,
  setEscActivePromise,
  clearEscActivePromise,
  resetEscState,
  type EscPayload,
  type EscState,
} from '../escState.js';
import { cancel as cancelActive } from '../../utils/cancellation.js';
import type { ExecuteAgentPassOptions } from './types.js';
import type { PlanRuntime } from './planRuntime.js';
import type { ExecutableCandidate } from './planRuntime.js';
import {
  prepareCommandCandidate,
  runApprovedCommand,
  type CommandExecutorOptions,
} from './commandRuntime/executor.js';
import { requestCommandApproval, type ApprovalGateOptions } from './commandRuntime/approvalGate.js';
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
  escState: EscState | null;
}

export class CommandRuntime {
  private readonly approvalOptions: ApprovalGateOptions;
  private readonly executorOptions: CommandExecutorOptions;
  private readonly resultOptions: ResultProcessorOptions;
  private readonly escState: EscState | null;

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

    this.escState = options.escState ?? null;
  }

  async execute(candidate: ExecutableCandidate): Promise<'continue' | 'command-rejected' | 'stop'> {
    const prepared = prepareCommandCandidate(candidate);

    const approvalOutcome = await this.awaitWithEsc(() =>
      requestCommandApproval(this.approvalOptions, prepared),
    );

    if (approvalOutcome.canceled) {
      this.emitCancellationStatus(approvalOutcome.payload);
      this.resetEscState();
      return 'stop';
    }

    const approvalResult = approvalOutcome.value;
    if (approvalResult.type === 'command-rejected') {
      return 'command-rejected';
    }

    const executionOutcome = await this.awaitWithEsc(() =>
      runApprovedCommand(this.executorOptions, approvalResult),
    );
    const executionResult = executionOutcome.value;

    const processedOutcome = await this.awaitWithEsc(() =>
      processCommandExecution(this.resultOptions, executionResult),
    );

    if (executionOutcome.canceled || processedOutcome.canceled) {
      this.emitCancellationStatus(executionOutcome.payload ?? processedOutcome.payload);
      this.resetEscState();
      return 'stop';
    }

    return processedOutcome.value.type;
  }

  private async awaitWithEsc<T>(
    promiseFactory: () => Promise<T>,
  ): Promise<{ value: T; canceled: boolean; payload: EscPayload | null }> {
    const escState = this.escState;
    if (!escState) {
      const value = await promiseFactory();
      return { value, canceled: false, payload: null };
    }

    const { promise: escPromise, cleanup } = createEscWaiter(escState);
    const operationPromise = promiseFactory();

    setEscActivePromise(escState, {
      promise: operationPromise,
      cancel: () => {
        cancelActive('ui-cancel');
      },
    });

    try {
      if (!escPromise) {
        const value = await operationPromise;
        return { value, canceled: false, payload: null };
      }

      const outcome = await Promise.race([
        operationPromise.then((value) => ({ kind: 'value' as const, value })),
        escPromise.then((payload) => ({ kind: 'esc' as const, payload })),
      ]);

      if (outcome.kind === 'esc') {
        const value = await operationPromise;
        return { value, canceled: true, payload: outcome.payload ?? null };
      }

      return { value: outcome.value, canceled: false, payload: null };
    } finally {
      cleanup();
      clearEscActivePromise(escState);
    }
  }

  private emitCancellationStatus(payload: EscPayload | null): void {
    const { emitEvent } = this.options;
    if (typeof emitEvent !== 'function') {
      return;
    }

    const detail = (() => {
      if (typeof payload === 'string') {
        const normalized = payload.trim();
        return normalized.length > 0 ? normalized : null;
      }
      if (payload && typeof payload === 'object') {
        const candidate = (payload as { reason?: unknown }).reason;
        if (typeof candidate === 'string') {
          const trimmed = candidate.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
      }
      return null;
    })();

    emitEvent({
      type: 'status',
      payload: {
        level: 'warn',
        message: 'Command execution canceled via user request.',
        details: detail,
      },
    });
  }

  private resetEscState(): void {
    if (this.escState) {
      resetEscState(this.escState);
    }
  }
}

export const createCommandRuntime = (options: CommandRuntimeOptions): CommandRuntime =>
  new CommandRuntime(options);
