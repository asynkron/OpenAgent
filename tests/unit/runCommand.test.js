import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';

function setupCancellationMocks() {
  const registerMock = jest.fn();
  const cancelMock = jest.fn();
  const isCanceledMock = jest.fn(() => false);
  const getActiveOperationMock = jest.fn(() => null);
  let lastHandle;

  registerMock.mockImplementation(({ description, onCancel }) => {
    lastHandle = {
      token: Symbol('test-run-command'),
      isCanceled: jest.fn(() => false),
      cancel: jest.fn(),
      setCancelCallback: jest.fn((fn) => {
        lastHandle.cancelFn = fn;
      }),
      updateDescription: jest.fn(),
      unregister: jest.fn(),
      description,
      cancelFn: onCancel,
    };
    return lastHandle;
  });

  jest.unstable_mockModule('../../src/utils/cancellation.js', () => ({
    register: registerMock,
    cancel: cancelMock,
    isCanceled: isCanceledMock,
    getActiveOperation: getActiveOperationMock,
    default: {
      register: registerMock,
      cancel: cancelMock,
      isCanceled: isCanceledMock,
      getActiveOperation: getActiveOperationMock,
    },
  }));

  return {
    registerMock,
    cancelMock,
    isCanceledMock,
    getActiveOperationMock,
    getLastHandle: () => lastHandle,
  };
}

describe('runCommand', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('throws when invoked without a normalized string command', async () => {
    const { runCommand } = await import('../../src/commands/run.js');

    await expect(runCommand({ bad: true }, '.', 1)).rejects.toThrow(
      'normalized command string',
    );
  });

  test('kills child process when cancellation is triggered', async () => {
    const spawnMock = jest.fn();

    jest.unstable_mockModule('node:child_process', () => ({
      spawn: spawnMock,
    }));

    const { registerMock, getLastHandle } = setupCancellationMocks();

    const { runCommand } = await import('../../src/commands/run.js');

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = jest.fn();
    child.stderr.setEncoding = jest.fn();
    child.kill = jest.fn(() => {
      child.emit('close', null);
    });

    spawnMock.mockReturnValue(child);

    const promise = runCommand('sleep 1', '.', 10);

    const handle = getLastHandle();
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock.mock.calls[0][0]).toMatchObject({
      description: expect.stringContaining('shell: sleep 1'),
    });
    expect(typeof handle.cancelFn).toBe('function');

    handle.cancelFn('canceled by test');

    const result = await promise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.killed).toBe(true);
    expect(result.stderr).toContain('Command was canceled.');
    expect(handle.unregister).toHaveBeenCalled();
  });

  test('writes provided stdin without closing when closeStdin is false', async () => {
    const spawnMock = jest.fn();

    jest.unstable_mockModule('node:child_process', () => ({
      spawn: spawnMock,
    }));

    setupCancellationMocks();

    const { runCommand } = await import('../../src/commands/run.js');

    const child = new EventEmitter();
    child.stdin = {
      write: jest.fn(),
      end: jest.fn(),
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = jest.fn();
    child.stderr.setEncoding = jest.fn();
    child.kill = jest.fn();

    spawnMock.mockReturnValue(child);

    const promise = runCommand('cat', '.', 5, {
      stdin: 'hello world',
      closeStdin: false,
      commandLabel: 'cat',
    });

    child.emit('close', 0);
    const result = await promise;

    expect(child.stdin.write).toHaveBeenCalledWith('hello world');
    expect(child.stdin.end).not.toHaveBeenCalled();
    expect(result.exit_code).toBe(0);
  });

  test('adds timeout detail when command exceeds limit', async () => {
    jest.useFakeTimers();

    const spawnMock = jest.fn();

    jest.unstable_mockModule('node:child_process', () => ({
      spawn: spawnMock,
    }));

    setupCancellationMocks();

    const { runCommand } = await import('../../src/commands/run.js');

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = jest.fn();
    child.stderr.setEncoding = jest.fn();
    child.kill = jest.fn(() => {
      child.emit('close', null);
    });

    spawnMock.mockReturnValue(child);

    const promise = runCommand('sleep 1', '.', 1);

    jest.advanceTimersByTime(1000);

    const result = await promise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.stderr).toContain('Command timed out and was terminated.');
    expect(result.stderr).toContain('Command timed out after 1s');
    expect(result.killed).toBe(true);
  });

  test('substitutes apply_patch shell command with local wrapper for string commands', async () => {
    const spawnMock = jest.fn();

    jest.unstable_mockModule('node:child_process', () => ({
      spawn: spawnMock,
    }));

    setupCancellationMocks();

    const { runCommand } = await import('../../src/commands/run.js');

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = jest.fn();
    child.stderr.setEncoding = jest.fn();
    child.kill = jest.fn();

    spawnMock.mockReturnValue(child);

    const promise = runCommand("apply_patch <<'PATCH'\nfoo\nPATCH", '.', 5);

    child.emit('close', 0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      expect.stringMatching(/^node scripts\/apply_patch\.mjs/),
      expect.objectContaining({ shell: true }),
    );
  });

});
