import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';

describe('runCommand cancellation integration', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('kills child process when cancellation is triggered', async () => {
    const spawnMock = jest.fn();

    jest.unstable_mockModule('node:child_process', () => ({
      spawn: spawnMock,
    }));

    const registerMock = jest.fn();
    const cancelMock = jest.fn();
    const isCanceledMock = jest.fn(() => false);
    const getActiveOperationMock = jest.fn(() => null);

    let cancellationHandle;

    registerMock.mockImplementation(({ description, onCancel }) => {
      cancellationHandle = {
        token: Symbol('test'),
        isCanceled: jest.fn(() => false),
        cancel: jest.fn(),
        setCancelCallback: jest.fn((fn) => {
          cancellationHandle.cancelFn = fn;
        }),
        updateDescription: jest.fn(),
        unregister: jest.fn(),
        description,
        cancelFn: onCancel,
      };
      return cancellationHandle;
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

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(typeof cancellationHandle.cancelFn).toBe('function');

    cancellationHandle.cancelFn('canceled by test');

    const result = await promise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.killed).toBe(true);
    expect(result.stderr).toContain('Command was canceled.');
    expect(cancellationHandle.unregister).toHaveBeenCalled();
  });
});
