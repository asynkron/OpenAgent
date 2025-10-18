import type { ApprovalManager } from '../../approvalManager.js';
import type { ExecuteAgentPassOptions } from '../types.js';
import type { PlanRuntime } from '../planRuntime.js';
import { type ApprovedCommand, type CommandRejectedResult, type PreparedCommand } from './types.js';

export interface ApprovalGateOptions {
  readonly approvalManager: ApprovalManager | null;
  readonly emitAutoApproveStatus: boolean;
  readonly emitEvent: ExecuteAgentPassOptions['emitEvent'];
  readonly planRuntime: PlanRuntime;
}

export const requestCommandApproval = async (
  options: ApprovalGateOptions,
  prepared: PreparedCommand,
): Promise<ApprovedCommand | CommandRejectedResult> => {
  const { approvalManager, emitAutoApproveStatus, emitEvent, planRuntime } = options;

  if (!approvalManager) {
    return { ...prepared, type: 'approved' } satisfies ApprovedCommand;
  }

  const autoApproval = approvalManager.shouldAutoApprove(prepared.command);

  if (!autoApproval.approved) {
    const outcome = await approvalManager.requestHumanDecision({ command: prepared.command });

    if (outcome.decision === 'reject') {
      const rejection = planRuntime.handleCommandRejection(prepared.planStep);
      planRuntime.applyEffects(rejection.effects);
      return { type: 'command-rejected' } satisfies CommandRejectedResult;
    }

    emitEvent?.({
      type: 'status',
      level: 'info',
      message:
        outcome.decision === 'approve_session'
          ? 'Command approved for the remainder of the session.'
          : 'Command approved for single execution.',
    });

    return { ...prepared, type: 'approved' } satisfies ApprovedCommand;
  }

  if (autoApproval.source === 'flag' && emitAutoApproveStatus) {
    emitEvent?.({
      type: 'status',
      level: 'info',
      message: 'Command auto-approved via flag.',
    });
  }

  return { ...prepared, type: 'approved' } satisfies ApprovedCommand;
};
