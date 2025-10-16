import type { ApprovalManager } from '../../approvalManager.js';
import type { EmitEvent } from '../types.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { CommandApproved, CommandRejected, PreparedCommand } from './types.js';

export interface CommandApprovalDependencies {
  approvalManager: ApprovalManager | null;
  emitEvent: EmitEvent | null | undefined;
  emitAutoApproveStatus: boolean;
  planRuntime: PlanRuntime;
}

const toApproved = (
  context: PreparedCommand,
  approvalSource: CommandApproved['approvalSource'],
): CommandApproved => ({
  ...context,
  status: 'approved',
  approvalSource,
});

const toRejected = (context: PreparedCommand): CommandRejected => ({
  ...context,
  status: 'rejected',
  reason: 'human-declined',
});

export const ensureCommandApproval = async (
  dependencies: CommandApprovalDependencies,
  context: PreparedCommand,
): Promise<CommandApproved | CommandRejected> => {
  const { approvalManager, emitAutoApproveStatus, emitEvent, planRuntime } = dependencies;

  if (!approvalManager) {
    return toApproved(context, 'none');
  }

  const autoApproval = approvalManager.shouldAutoApprove(context.command);
  if (!autoApproval.approved) {
    const outcome = await approvalManager.requestHumanDecision({ command: context.command });

    if (outcome.decision === 'reject') {
      planRuntime.handleCommandRejection(context.planStep);
      return toRejected(context);
    }

    const approvalSource = outcome.decision === 'approve_session' ? 'human-session' : 'human-once';

    emitEvent?.({
      type: 'status',
      level: 'info',
      message:
        outcome.decision === 'approve_session'
          ? 'Command approved for the remainder of the session.'
          : 'Command approved for single execution.',
    });

    return toApproved(context, approvalSource);
  }

  if (autoApproval.source === 'flag') {
    if (emitAutoApproveStatus) {
      emitEvent?.({
        type: 'status',
        level: 'info',
        message: 'Command auto-approved via flag.',
      });
    }

    return toApproved(context, 'flag');
  }

  if (autoApproval.source === 'allowlist') {
    return toApproved(context, 'allowlist');
  }

  if (autoApproval.source === 'session') {
    return toApproved(context, 'session');
  }

  return toApproved(context, 'none');
};
