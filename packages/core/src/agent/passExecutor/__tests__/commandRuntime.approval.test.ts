/* eslint-env jest */
import { jest } from '@jest/globals';
import { ensureCommandApproval } from '../commandRuntime/approval.js';
import type { CommandApprovalDependencies } from '../commandRuntime/approval.js';
import type { PreparedCommand } from '../commandRuntime/types.js';
import type { ApprovalManager } from '../../approvalManager.js';
import type { PlanRuntime } from '../planRuntime.js';

describe('commandRuntime.ensureCommandApproval', () => {
  const baseCommand: PreparedCommand = {
    command: { run: 'echo hello' } as Record<string, unknown>,
    planStep: null,
    normalizedRun: 'echo hello',
  };

  const buildDependencies = (
    overrides: Partial<CommandApprovalDependencies> = {},
  ): CommandApprovalDependencies => ({
    approvalManager: null,
    emitEvent: jest.fn(),
    emitAutoApproveStatus: false,
    planRuntime: {
      handleCommandRejection: jest.fn(),
    } as unknown as PlanRuntime,
    ...overrides,
  });

  test('auto-approves when no approval manager is provided', async () => {
    const deps = buildDependencies();

    const outcome = await ensureCommandApproval(deps, baseCommand);

    expect(outcome).toEqual({
      ...baseCommand,
      status: 'approved',
      approvalSource: 'none',
    });
  });

  test('requests human decision and records rejection', async () => {
    const approvalManager = {
      shouldAutoApprove: jest.fn(() => ({ approved: false, source: null })),
      requestHumanDecision: jest.fn(async () => ({ decision: 'reject' })),
    } as unknown as ApprovalManager;
    const deps = buildDependencies({ approvalManager });

    const outcome = await ensureCommandApproval(deps, baseCommand);

    expect(outcome).toEqual({
      ...baseCommand,
      status: 'rejected',
      reason: 'human-declined',
    });
    expect(deps.planRuntime.handleCommandRejection).toHaveBeenCalledWith(baseCommand.planStep);
  });

  test('emits info events when human approves a session', async () => {
    const emitEvent = jest.fn();
    const approvalManager = {
      shouldAutoApprove: jest.fn(() => ({ approved: false, source: null })),
      requestHumanDecision: jest.fn(async () => ({ decision: 'approve_session' })),
    } as unknown as ApprovalManager;
    const deps = buildDependencies({ approvalManager, emitEvent });

    const outcome = await ensureCommandApproval(deps, baseCommand);

    expect(outcome).toEqual({
      ...baseCommand,
      status: 'approved',
      approvalSource: 'human-session',
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'status',
      level: 'info',
      message: 'Command approved for the remainder of the session.',
    });
  });

  test('announces flag-based auto approvals when enabled', async () => {
    const emitEvent = jest.fn();
    const approvalManager = {
      shouldAutoApprove: jest.fn(() => ({ approved: true, source: 'flag' })),
      requestHumanDecision: jest.fn(),
    } as unknown as ApprovalManager;
    const deps = buildDependencies({
      approvalManager,
      emitEvent,
      emitAutoApproveStatus: true,
    });

    const outcome = await ensureCommandApproval(deps, baseCommand);

    expect(outcome).toEqual({
      ...baseCommand,
      status: 'approved',
      approvalSource: 'flag',
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'status',
      level: 'info',
      message: 'Command auto-approved via flag.',
    });
  });
});
