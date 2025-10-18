/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { requestCommandApproval } from '../approvalGate.js';
import type { PlanRuntime } from '../../planRuntime.js';

const createPlanRuntimeMock = (): PlanRuntime =>
  ({
    handleCommandRejection: jest.fn().mockReturnValue({
      type: 'command-rejected',
      effects: [{ type: 'history-entry', entry: { role: 'assistant', content: [] } }],
    }),
    applyEffects: jest.fn(),
    markCommandRunning: jest.fn(),
    emitPlanSnapshot: jest.fn(),
    applyCommandObservation: jest.fn(),
    buildPlanObservation: jest.fn(),
    selectNextExecutableEntry: jest.fn(),
    initialize: jest.fn(),
    handleNoExecutable: jest.fn(),
    finalize: jest.fn(),
    resetPlanReminder: jest.fn(),
  }) as unknown as PlanRuntime;

describe('requestCommandApproval', () => {
  test('returns approved when manager missing', async () => {
    const planRuntime = createPlanRuntimeMock();
    const prepared = {
      type: 'prepared',
      command: { run: 'echo' },
      planStep: null,
      normalizedRun: 'echo',
    };

    const result = await requestCommandApproval(
      {
        approvalManager: null,
        emitAutoApproveStatus: false,
        emitEvent: jest.fn(),
        planRuntime,
      },
      prepared,
    );

    expect(result).toMatchObject({ type: 'approved', command: prepared.command });
  });

  test('applies rejection effects when human declines', async () => {
    const planRuntime = createPlanRuntimeMock();
    const rejectionResult = {
      type: 'command-rejected',
      effects: [{ type: 'history-entry', entry: {} }],
    };
    (planRuntime.handleCommandRejection as unknown as jest.Mock).mockReturnValue(rejectionResult);

    const approvalManager = {
      shouldAutoApprove: jest.fn().mockReturnValue({ approved: false, source: null }),
      requestHumanDecision: jest.fn().mockResolvedValue({ decision: 'reject' }),
    };

    const prepared = {
      type: 'prepared',
      command: { run: 'ls' },
      planStep: null,
      normalizedRun: 'ls',
    } as const;

    const result = await requestCommandApproval(
      {
        approvalManager: approvalManager as never,
        emitAutoApproveStatus: false,
        emitEvent: jest.fn(),
        planRuntime,
      },
      prepared,
    );

    expect(planRuntime.handleCommandRejection).toHaveBeenCalledWith(prepared.planStep);
    expect(planRuntime.applyEffects).toHaveBeenCalledWith(rejectionResult.effects);
    expect(result).toEqual({ type: 'command-rejected' });
  });
});
