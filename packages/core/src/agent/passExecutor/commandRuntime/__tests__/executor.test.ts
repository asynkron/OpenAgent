/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { prepareCommandCandidate, runApprovedCommand } from '../executor.js';
import type { PlanRuntime } from '../../planRuntime.js';

const createPlanRuntimeMock = () => ({
  markCommandRunning: jest.fn(),
  emitPlanSnapshot: jest.fn().mockReturnValue({ type: 'plan-snapshot', plan: [] }),
  applyEffects: jest.fn(),
} as unknown as PlanRuntime);

describe('prepareCommandCandidate', () => {
  test('trims command run text', () => {
    const candidate = {
      step: { id: 's1', status: 'pending' },
      command: { run: '  ls  ' },
    };

    const prepared = prepareCommandCandidate(candidate as never);
    expect(prepared).toMatchObject({
      type: 'prepared',
      normalizedRun: 'ls',
      command: { run: 'ls' },
    });
  });
});

describe('runApprovedCommand', () => {
  test('executes command safely and emits snapshot effect', async () => {
    const planRuntime = createPlanRuntimeMock();
    const executeAgentCommandFn = jest.fn().mockResolvedValue({
      result: { exit_code: 0 },
      executionDetails: { type: 'EXECUTE' },
    });

    const outcome = await runApprovedCommand(
      {
        executeAgentCommandFn: executeAgentCommandFn as never,
        runCommandFn: jest.fn(),
        emitEvent: jest.fn(),
        planRuntime,
      },
      {
        type: 'approved',
        command: { run: 'ls' },
        planStep: { id: 'root', status: 'pending' },
        normalizedRun: 'ls',
      },
    );

    expect(planRuntime.markCommandRunning).toHaveBeenCalled();
    expect(planRuntime.applyEffects).toHaveBeenCalledWith([{ type: 'plan-snapshot', plan: [] }]);
    expect(outcome).toMatchObject({ type: 'executed', result: { exit_code: 0 } });
  });
});
