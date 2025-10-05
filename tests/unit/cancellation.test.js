import { jest } from '@jest/globals';

import {
  register,
  cancel,
  isCanceled,
  getActiveOperation,
} from '../../src/utils/cancellation.js';

describe('cancellation manager', () => {
  afterEach(() => {
    cancel();
    if (getActiveOperation()) {
      const handle = register({ description: 'cleanup' });
      handle.unregister();
    }
  });

  test('register marks canceled and invokes callback once', () => {
    const onCancel = jest.fn();
    const handle = register({ description: 'test', onCancel });

    expect(handle.isCanceled()).toBe(false);
    expect(isCanceled(handle.token)).toBe(false);

    const first = handle.cancel('stop');

    expect(first).toBe(true);
    expect(handle.isCanceled()).toBe(true);
    expect(isCanceled(handle.token)).toBe(true);
    expect(onCancel).toHaveBeenCalledWith('stop');
    expect(onCancel).toHaveBeenCalledTimes(1);

    const second = handle.cancel('again');
    expect(second).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('cancel() aborts active operation', () => {
    const onCancel = jest.fn();
    register({ description: 'manual', onCancel });

    const result = cancel('manual cancel');

    expect(result).toBe(true);
    expect(onCancel).toHaveBeenCalledWith('manual cancel');
    expect(getActiveOperation().canceled).toBe(true);
  });

  test('updateDescription and unregister clean state', () => {
    const handle = register({ description: 'initial' });

    handle.updateDescription('updated description');
    const active = getActiveOperation();
    expect(active.description).toBe('updated description');

    handle.unregister();
    expect(getActiveOperation()).toBeNull();
  });

  test('setCancelCallback can replace cancel handler', () => {
    const handle = register({ description: 'replace handler' });
    const callback = jest.fn();

    handle.setCancelCallback(callback);

    cancel('swap');

    expect(callback).toHaveBeenCalledWith('swap');
  });
});
