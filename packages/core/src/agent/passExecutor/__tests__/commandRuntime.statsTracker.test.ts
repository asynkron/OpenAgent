/* eslint-env jest */
import { jest } from '@jest/globals';
import { deriveCommandKey, recordCommandStats } from '../commandRuntime/statsTracker.js';
import type { CommandStatsDependencies } from '../commandRuntime/statsTracker.js';
import type { CommandExecution } from '../commandRuntime/types.js';

describe('commandRuntime.recordCommandStats', () => {
  const baseExecution: CommandExecution = {
    command: { run: 'git status' } as Record<string, unknown>,
    planStep: null,
    normalizedRun: 'git status',
    status: 'executed',
    approvalSource: 'none',
    outcome: {
      result: { exit_code: 0 },
      executionDetails: { type: 'EXECUTE' },
    },
  };

  const buildDependencies = (
    overrides: Partial<CommandStatsDependencies> = {},
  ): CommandStatsDependencies => ({
    incrementCommandCountFn: jest.fn(async () => {}),
    emitEvent: jest.fn(),
    ...overrides,
  });

  test('derives the command key from an explicit key value', () => {
    const key = deriveCommandKey({ key: '  npm  ' } as Record<string, unknown>, '');
    expect(key).toBe('npm');
  });

  test('records stats and returns the derived key', async () => {
    const deps = buildDependencies();

    const result = await recordCommandStats(deps, baseExecution);

    expect(result).toEqual({
      ...baseExecution,
      status: 'stats-recorded',
      key: 'git',
    });
    expect(deps.incrementCommandCountFn).toHaveBeenCalledWith('git');
  });

  test('emits a warning when incrementing fails', async () => {
    const emitEvent = jest.fn();
    const deps = buildDependencies({
      incrementCommandCountFn: jest.fn(async () => {
        throw new Error('nope');
      }),
      emitEvent,
    });

    const result = await recordCommandStats(deps, baseExecution);

    expect(result).toEqual({
      ...baseExecution,
      status: 'stats-failed',
      key: 'git',
      error: 'nope',
    });
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'status',
      level: 'warn',
      message: 'Failed to record command usage statistics.',
      details: 'nope',
    });
  });
});
