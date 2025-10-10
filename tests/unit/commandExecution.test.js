import { jest } from '@jest/globals';

import { executeAgentCommand } from '../../src/agent/commandExecution.js';
import { extractReadSpecFromCommand } from '../../src/utils/readCommand.js';

describe('executeAgentCommand', () => {
  const makeDeps = () => ({
    runCommandFn: jest.fn(async () => ({ stdout: 'run', stderr: '', exit_code: 0 })),
  });

  test('normalizes read run strings into script invocation', async () => {
    const deps = makeDeps();
    const command = { run: 'read README.md', cwd: '/repo' };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).toHaveBeenCalledTimes(1);
    const [normalizedRun, cwdArg, timeoutArg] = deps.runCommandFn.mock.calls[0];
    expect(normalizedRun.startsWith('node scripts/read.mjs --spec-base64')).toBe(true);
    expect(cwdArg).toBe('/repo');
    expect(timeoutArg).toBe(60);

    const decodedSpec = extractReadSpecFromCommand(normalizedRun);
    expect(decodedSpec).toEqual({ path: 'README.md' });

    expect(result.stdout).toBe('run');
    expect(executionDetails.type).toBe('READ');
    expect(executionDetails.spec).toEqual({ path: 'README.md' });
    expect(executionDetails.command.run).toBe(normalizedRun);
  });

  test('preserves numeric read options when normalizing', async () => {
    const deps = makeDeps();
    const command = {
      run: 'read ./logs/app.log --max-lines 20 --max-bytes=512 --encoding utf8',
      cwd: '.',
    };

    const { executionDetails } = await executeAgentCommand({ command, ...deps });

    const normalizedRun = deps.runCommandFn.mock.calls[0][0];
    const decodedSpec = extractReadSpecFromCommand(normalizedRun);
    expect(decodedSpec).toEqual({
      path: './logs/app.log',
      max_lines: 20,
      max_bytes: 512,
      encoding: 'utf8',
    });
    expect(executionDetails.spec).toEqual(decodedSpec);
  });

  test('falls back to runCommand for non-read invocations', async () => {
    const deps = makeDeps();
    const command = { run: 'node index.js', cwd: '/project', timeout_sec: 120 };

    const { result, executionDetails } = await executeAgentCommand({ command, ...deps });

    expect(deps.runCommandFn).toHaveBeenCalledWith('node index.js', '/project', 120, undefined);
    expect(result.stdout).toBe('run');
    expect(executionDetails).toEqual({ type: 'EXECUTE', command });
  });
});
