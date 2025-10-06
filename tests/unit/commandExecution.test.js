import { jest } from '@jest/globals';
import { executeAgentCommand } from '../../src/agent/commandExecution.js';

describe('executeAgentCommand', () => {
  const makeDeps = () => ({
    runCommandFn: jest.fn(async () => ({ stdout: 'run', stderr: '', exit_code: 0 })),
    runBrowseFn: jest.fn(async () => ({ stdout: 'browse', stderr: '', exit_code: 0 })),
    runEditFn: jest.fn(async () => ({ stdout: 'edit', stderr: '', exit_code: 0 })),
    runReadFn: jest.fn(async () => ({ stdout: 'read', stderr: '', exit_code: 0 })),
    runReplaceFn: jest.fn(async () => ({ stdout: 'replace', stderr: '', exit_code: 0 })),
    runEscapeStringFn: jest.fn(async () => ({ stdout: 'escape', stderr: '', exit_code: 0 })),
    runUnescapeStringFn: jest.fn(async () => ({ stdout: 'unescape', stderr: '', exit_code: 0 })),
  });

  test('executes edit command when edit spec present', async () => {
    const deps = makeDeps();
    const command = { edit: { path: 'file.txt', changes: [] }, cwd: 'app' };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runEditFn).toHaveBeenCalledWith(command.edit, 'app');
    expect(result.stdout).toBe('edit');
    expect(executionDetails).toEqual({ type: 'EDIT', spec: command.edit });
  });

  test('executes read command when read spec provided', async () => {
    const deps = makeDeps();
    const command = { read: { path: 'README.md' }, cwd: '/repo' };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runReadFn).toHaveBeenCalledWith(command.read, '/repo');
    expect(result.stdout).toBe('read');
    expect(executionDetails).toEqual({ type: 'READ', spec: command.read });
  });

  test('executes escape_string built-in before others', async () => {
    const deps = makeDeps();
    const command = { escape_string: { text: 'hello' } };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runEscapeStringFn).toHaveBeenCalledWith(command.escape_string, '.');
    expect(deps.runCommandFn).not.toHaveBeenCalled();
    expect(result.stdout).toBe('escape');
    expect(executionDetails).toEqual({ type: 'ESCAPE_STRING', spec: command.escape_string });
  });

  test('routes run command that starts with browse to runBrowse', async () => {
    const deps = makeDeps();
    const command = { run: 'browse https://example.com', timeout_sec: 15 };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runBrowseFn).toHaveBeenCalledWith('https://example.com', 15);
    expect(result.stdout).toBe('browse');
    expect(executionDetails).toEqual({ type: 'BROWSE', target: 'https://example.com' });
    expect(deps.runCommandFn).not.toHaveBeenCalled();
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
