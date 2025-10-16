/* eslint-env jest */
import { jest } from '@jest/globals';
import { createCommandRuntime } from '../commandRuntime.js';
import type ObservationBuilder from '../../observationBuilder.js';
import type { PlanRuntime } from '../planRuntime.js';
import type { ExecutableCandidate } from '../planRuntime.js';

const createObservationBuilder = (): ObservationBuilder => ({
  build: jest.fn(() => ({
    renderPayload: { text: 'preview' },
    observation: { summary: 'complete' },
  })),
  buildCancellationObservation: jest.fn(),
} as unknown as ObservationBuilder);

const createPlanRuntime = () => ({
  markCommandRunning: jest.fn(),
  emitPlanSnapshot: jest.fn(),
  applyCommandObservation: jest.fn(),
}) as unknown as PlanRuntime;

describe('commandRuntime integration', () => {
  test('runs the approval, execution, stats, and emission pipeline', async () => {
    const emitEvent = jest.fn();
    const emitDebug = jest.fn();
    const planRuntime = createPlanRuntime();
    const observationBuilder = createObservationBuilder();
    const planStep = { id: 'step-42', status: 'pending' } as Record<string, unknown>;
    const candidate: ExecutableCandidate = {
      step: planStep as never,
      command: { run: '  ls -a  ', key: ' list ' } as Record<string, unknown>,
    } as ExecutableCandidate;

    const commandRuntime = createCommandRuntime({
      approvalManager: {
        shouldAutoApprove: () => ({ approved: true, source: 'flag' }),
        requestHumanDecision: jest.fn(),
      } as never,
      emitEvent,
      emitAutoApproveStatus: true,
      runCommandFn: jest.fn(),
      executeAgentCommandFn: jest.fn(async () => ({
        result: { stdout: 'ok', stderr: '', exit_code: 0 },
        executionDetails: { type: 'EXECUTE', command: { run: 'ls -a' } },
      })),
      incrementCommandCountFn: jest.fn(async () => {}),
      observationBuilder,
      planRuntime,
      emitDebug,
    });

    const result = await commandRuntime.execute(candidate);

    expect(result.status).toBe('executed');
    expect(result.approval).toMatchObject({ approvalSource: 'flag' });
    expect(result.execution.outcome.result).toMatchObject({ stdout: 'ok', exit_code: 0 });
    expect(result.stats).toMatchObject({ status: 'stats-recorded', key: 'list' });
    expect(result.emission).toMatchObject({
      status: 'emitted',
      observation: { summary: 'complete' },
      preview: { text: 'preview' },
    });

    expect(planRuntime.markCommandRunning).toHaveBeenCalledWith(planStep);
    expect(planRuntime.applyCommandObservation).toHaveBeenCalledWith({
      planStep,
      observation: { summary: 'complete' },
      commandResult: { stdout: 'ok', stderr: '', exit_code: 0 },
    });

    const approvalEvent = emitEvent.mock.calls.find(([event]) => event.message === 'Command auto-approved via flag.');
    expect(approvalEvent).toBeTruthy();

    const commandResultEvent = emitEvent.mock.calls.find(([event]) => event.type === 'command-result');
    expect(commandResultEvent?.[0]).toMatchObject({
      result: { stdout: 'ok', exit_code: 0 },
      preview: { text: 'preview' },
    });

    const debugFactory = emitDebug.mock.calls[0][0] as () => unknown;
    expect(debugFactory()).toMatchObject({
      stage: 'command-execution',
      observation: { summary: 'complete' },
    });
  });
});
