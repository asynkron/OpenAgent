/* eslint-env jest */
import { jest } from '@jest/globals';
import { executeCommandSafely } from '../commandRuntime/safeExecution.js';
import type { SafeExecutionDependencies } from '../commandRuntime/safeExecution.js';
import type { CommandApproved } from '../commandRuntime/types.js';

describe('commandRuntime.executeCommandSafely', () => {
  const baseApproved: CommandApproved = {
    command: { run: 'echo hi' } as Record<string, unknown>,
    planStep: null,
    normalizedRun: 'echo hi',
    status: 'approved',
    approvalSource: 'none',
  };

  const buildDependencies = (
    overrides: Partial<SafeExecutionDependencies> = {},
  ): SafeExecutionDependencies => ({
    executeAgentCommandFn: jest.fn(),
    runCommandFn: jest.fn(),
    emitEvent: jest.fn(),
    ...overrides,
  });

  test('returns the outcome from the executeAgentCommandFn', async () => {
    const outcome = {
      result: { stdout: 'ok' },
      executionDetails: { type: 'EXECUTE' },
    };
    const deps = buildDependencies({
      executeAgentCommandFn: jest.fn(async () => outcome),
    });

    const result = await executeCommandSafely(deps, baseApproved);

    expect(result).toEqual({
      ...baseApproved,
      status: 'executed',
      outcome,
    });
    expect(deps.executeAgentCommandFn).toHaveBeenCalledWith({
      command: baseApproved.command,
      runCommandFn: deps.runCommandFn,
    });
  });

  test('normalizes thrown errors and emits a status event', async () => {
    const error = new Error('boom');
    const emitEvent = jest.fn();
    const deps = buildDependencies({
      executeAgentCommandFn: jest.fn(async () => {
        throw error;
      }),
      emitEvent,
    });

    const result = await executeCommandSafely(deps, baseApproved);

    expect(result.outcome.result.stderr).toBe('boom');
    expect(result.outcome.executionDetails).toMatchObject({
      error: { message: 'boom' },
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'status',
      level: 'error',
      message: 'Command execution threw an exception.',
      details: error.stack || error.message,
    });
  });
});
