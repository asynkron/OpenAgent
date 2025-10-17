/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { processCommandExecution } from '../resultProcessor.js';
import type { PlanRuntime } from '../../planRuntime.js';
import type { EmitEvent } from '../../types.js';
import type { DebugEmitter } from '../../debugEmitter.js';

const createEmitEventMock = (): jest.MockedFunction<EmitEvent> =>
  jest.fn<ReturnType<EmitEvent>, Parameters<EmitEvent>>();

const createEmitDebugMock = (): jest.MockedFunction<DebugEmitter['emit']> =>
  jest.fn<ReturnType<DebugEmitter['emit']>, Parameters<DebugEmitter['emit']>>();

const createPlanRuntimeMock = () => ({
  applyCommandObservation: jest.fn(),
  emitPlanSnapshot: jest.fn().mockReturnValue({ type: 'plan-snapshot', plan: [] }),
  applyEffects: jest.fn(),
} as unknown as PlanRuntime);

describe('processCommandExecution', () => {
  test('records stats, emits event, and snapshots plan', async () => {
    const planRuntime = createPlanRuntimeMock();
    const incrementCommandCountFn = jest.fn();
    const emitEvent = createEmitEventMock();
    const emitDebug = createEmitDebugMock();

    const observationBuilder = {
      build: jest.fn().mockReturnValue({
        renderPayload: { text: 'ok' },
        observation: {
          observation_for_llm: { stdout: '', stderr: '', truncated: false },
          observation_metadata: { timestamp: '2024-01-01T00:00:00.000Z' },
        },
      }),
    };

    const executed = {
      type: 'executed' as const,
      command: { run: 'echo hello' },
      planStep: { id: 'task-1', status: 'completed' },
      normalizedRun: 'echo',
      result: { exit_code: 0 },
      outcome: { result: { exit_code: 0 }, executionDetails: { type: 'EXECUTE' } },
    };

    const result = await processCommandExecution(
      {
        observationBuilder: observationBuilder as never,
        planRuntime,
        emitDebug,
        emitEvent,
        incrementCommandCountFn: incrementCommandCountFn as never,
      },
      executed,
    );

    expect(incrementCommandCountFn).toHaveBeenCalledWith('echo');
    expect(planRuntime.applyCommandObservation).toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'command-result', command: executed.command }),
    );
    expect(planRuntime.applyEffects).toHaveBeenCalledWith([{ type: 'plan-snapshot', plan: [] }]);
    expect(result).toEqual({ type: 'continue' });
    expect(emitDebug).toHaveBeenCalled();
  });
});
