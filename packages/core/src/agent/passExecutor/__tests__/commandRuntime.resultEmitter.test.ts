/* eslint-env jest */
import { jest } from '@jest/globals';
import { emitCommandResult } from '../commandRuntime/resultEmitter.js';
import type { ResultEmitterDependencies } from '../commandRuntime/resultEmitter.js';
import type { CommandExecution } from '../commandRuntime/types.js';
import type ObservationBuilder from '../../observationBuilder.js';
import type { PlanRuntime } from '../planRuntime.js';

describe('commandRuntime.emitCommandResult', () => {
  const planStep = { id: 'step-1', status: 'pending' } as Record<string, unknown>;
  const outcome = {
    result: { exit_code: 0, stdout: 'done' },
    executionDetails: { type: 'EXECUTE', command: { run: 'ls' } },
  };
  const baseExecution: CommandExecution = {
    command: { run: 'ls -la' } as Record<string, unknown>,
    planStep: planStep as unknown,
    normalizedRun: 'ls -la',
    status: 'executed',
    approvalSource: 'none',
    outcome,
  };

  const buildDependencies = (
    overrides: Partial<ResultEmitterDependencies> = {},
  ): ResultEmitterDependencies => {
    const observationBuilder = {
      build: jest.fn(() => ({
        renderPayload: { text: 'preview' },
        observation: { summary: 'done' },
      })),
    } as unknown as ObservationBuilder;

    const planRuntime = {
      applyCommandObservation: jest.fn(),
      emitPlanSnapshot: jest.fn(),
    } as unknown as PlanRuntime;

    return {
      observationBuilder,
      planRuntime,
      emitEvent: jest.fn(),
      emitDebug: jest.fn(),
      ...overrides,
    } satisfies ResultEmitterDependencies;
  };

  test('applies observations, emits events, and returns the payload', () => {
    const deps = buildDependencies();

    const result = emitCommandResult(deps, baseExecution);

    expect(result).toEqual({
      ...baseExecution,
      status: 'emitted',
      observation: { summary: 'done' },
      commandResult: outcome.result,
      preview: { text: 'preview' },
    });

    expect(deps.observationBuilder.build).toHaveBeenCalledWith({
      command: baseExecution.command,
      result: outcome.result,
    });
    expect(deps.planRuntime.applyCommandObservation).toHaveBeenCalledWith({
      planStep: baseExecution.planStep,
      observation: { summary: 'done' },
      commandResult: outcome.result,
    });
    expect(deps.planRuntime.emitPlanSnapshot).toHaveBeenCalled();

    const [event] = (deps.emitEvent as jest.Mock).mock.calls[0];
    expect(event).toMatchObject({
      type: 'command-result',
      result: outcome.result,
      preview: { text: 'preview' },
    });
    expect(event.planStep).not.toBe(planStep);

    const debugPayloadFactory = (deps.emitDebug as jest.Mock).mock.calls[0][0] as () => unknown;
    expect(debugPayloadFactory()).toMatchObject({
      stage: 'command-execution',
      command: baseExecution.command,
      result: outcome.result,
      execution: outcome.executionDetails,
      observation: { summary: 'done' },
    });
  });
});
