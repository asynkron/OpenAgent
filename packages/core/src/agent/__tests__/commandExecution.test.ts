// @ts-nocheck
/* eslint-env jest */
import { jest } from '@jest/globals';

import { executeAgentCommand } from '../commandExecution.js';
import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../../constants.js';

describe('executeAgentCommand', () => {
  const makeDeps = () => ({
    runCommandFn: jest.fn(async () => ({ stdout: 'run', stderr: '', exit_code: 0 })),
  });

  test('trims run strings before invoking runCommand', async () => {
    const deps = makeDeps();
    const command = { run: '  node index.js  ', cwd: '/project', timeout_sec: 120 };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).toHaveBeenCalledWith('node index.js', '/project', 120, undefined);
    expect(result.stdout).toBe('run');
    expect(executionDetails).toEqual({
      type: 'EXECUTE',
      command: {
        reason: '',
        shell: '',
        run: 'node index.js',
        cwd: '/project',
        timeout_sec: 120,
        filter_regex: '',
        tail_lines: DEFAULT_COMMAND_TAIL_LINES,
        max_bytes: DEFAULT_COMMAND_MAX_BYTES,
      },
    });
  });

  test('defaults cwd and timeout when omitted', async () => {
    const deps = makeDeps();
    const command = { run: 'ls' };

    await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).toHaveBeenCalledWith('ls', '.', 60, undefined);
  });

  test('dispatches virtual commands to the injected executor', async () => {
    const deps = makeDeps();
    const virtualExecutor = jest.fn(async () => ({
      result: { stdout: 'virtual-output', stderr: '', exit_code: 0, killed: false, runtime_ms: 1 },
      executionDetails: {
        type: 'VIRTUAL',
        command: {
          reason: '',
          shell: 'openagent',
          run: 'virtual-agent research {"topic":"demo"}',
          cwd: '.',
          timeout_sec: 60,
          filter_regex: '',
          tail_lines: DEFAULT_COMMAND_TAIL_LINES,
          max_bytes: DEFAULT_COMMAND_MAX_BYTES,
        },
      },
    }));

    const command = {
      shell: 'openagent',
      run: 'virtual-agent research {"topic":"demo"}',
    };

    const outcome = await executeAgentCommand({ command, ...deps, virtualCommandExecutor: virtualExecutor });

    expect(virtualExecutor).toHaveBeenCalledWith({
      command: {
        reason: '',
        shell: 'openagent',
        run: 'virtual-agent research {"topic":"demo"}',
        cwd: '.',
        timeout_sec: 60,
        filter_regex: '',
        tail_lines: DEFAULT_COMMAND_TAIL_LINES,
        max_bytes: DEFAULT_COMMAND_MAX_BYTES,
      },
      descriptor: { action: 'research', argument: '{"topic":"demo"}' },
    });
    expect(deps.runCommandFn).not.toHaveBeenCalled();
    expect(outcome.result.stdout).toBe('virtual-output');
  });

  test('returns a fallback error when no virtual executor is configured', async () => {
    const deps = makeDeps();
    const command = {
      shell: 'openagent',
      run: 'virtual-agent explore something interesting',
    };

    const outcome = await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).not.toHaveBeenCalled();
    expect(outcome.result.exit_code).toBe(1);
    expect(outcome.executionDetails.type).toBe('VIRTUAL');
    expect(outcome.executionDetails.error?.message).toContain('virtualCommandExecutor');
  });

  test('truncates long virtual command arguments in the fallback message', async () => {
    const deps = makeDeps();
    const longArgument = 'x'.repeat(500);
    const command = {
      shell: 'openagent',
      run: `virtual-agent explore ${longArgument}`,
    };

    const outcome = await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).not.toHaveBeenCalled();
    expect(outcome.result.exit_code).toBe(1);
    expect(outcome.result.stderr).toContain('…');
    expect(outcome.result.stderr.includes(longArgument)).toBe(false);
  });
});
