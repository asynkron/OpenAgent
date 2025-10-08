import { jest } from '@jest/globals';
import { executeAgentCommand } from '../../src/agent/commandExecution.js';

describe('executeAgentCommand', () => {
  const makeDeps = () => ({
    runCommandFn: jest.fn(async () => ({ stdout: 'run', stderr: '', exit_code: 0 })),
    runReadFn: jest.fn(async () => ({ stdout: 'read', stderr: '', exit_code: 0 })),
  });

  test('executes read command when read spec provided', async () => {
    const deps = makeDeps();
    const command = { read: { path: 'README.md' }, cwd: '/repo' };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runReadFn).toHaveBeenCalledWith(command.read, '/repo');
    expect(result.stdout).toBe('read');
    expect(executionDetails).toEqual({ type: 'READ', spec: command.read });
  });

  test('merges read tokens when run command starts with read', async () => {
    const deps = makeDeps();
    const command = {
      run: 'read logs/app.log --max-lines 20 --max-bytes=512',
      read: { encoding: 'utf8' },
      cwd: '/app',
    };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runReadFn).toHaveBeenCalledTimes(1);
    const [specArg, cwdArg] = deps.runReadFn.mock.calls[0];
    expect(cwdArg).toBe('/app');
    expect(specArg).toEqual(
      expect.objectContaining({
        path: 'logs/app.log',
        encoding: 'utf8',
        max_lines: 20,
        max_bytes: 512,
      }),
    );
    expect(result.stdout).toBe('read');
    expect(executionDetails.type).toBe('READ');
  });

  test('falls back to runCommand when no other handlers match', async () => {
    const deps = makeDeps();
    const command = { run: 'node index.js', cwd: '/project', timeout_sec: 120 };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).toHaveBeenCalledWith('node index.js', '/project', 120, undefined);
    expect(result.stdout).toBe('run');
    expect(executionDetails).toEqual({ type: 'EXECUTE', command });
  });
});
