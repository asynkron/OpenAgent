// @ts-nocheck
/* eslint-env jest */
import { jest } from '@jest/globals';

import { executeAgentCommand } from '../commandExecution.js';
import {
  DEFAULT_COMMAND_MAX_BYTES,
  DEFAULT_COMMAND_TAIL_LINES,
} from '../../constants.js';

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
});
