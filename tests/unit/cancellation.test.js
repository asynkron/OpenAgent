import { jest } from '@jest/globals';

import { register, cancel, isCanceled, getActiveOperation } from '../../src/utils/cancellation.js';

describe('cancellation manager', () => {
  afterEach(() => {
    cancel();
    const active = getActiveOperation();
    if (active) {
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
    expect(getActiveOperation()).toBeNull();
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
    expect(getActiveOperation()).toBeNull();
  });

  test('supports nested registrations with stack semantics', () => {
    const first = register({ description: 'first' });
    register({ description: 'second' });

    const active = getActiveOperation();
    expect(active.description).toBe('second');

    cancel('stop-second');

    expect(first.isCanceled()).toBe(false);
    expect(getActiveOperation().description).toBe('first');

    first.cancel('stop-first');
    expect(getActiveOperation()).toBeNull();
  });

  test('cancel unwinds stacked operations one level at a time', () => {
    const firstCancel = jest.fn();
    const secondCancel = jest.fn();
    const thirdCancel = jest.fn();

    register({ description: 'one', onCancel: firstCancel });
    register({ description: 'two', onCancel: secondCancel });
    register({ description: 'three', onCancel: thirdCancel });

    expect(cancel('first-pass')).toBe(true);
    expect(thirdCancel).toHaveBeenCalledWith('first-pass');
    expect(secondCancel).not.toHaveBeenCalled();
    expect(firstCancel).not.toHaveBeenCalled();

    expect(cancel('second-pass')).toBe(true);
    expect(secondCancel).toHaveBeenCalledWith('second-pass');
    expect(firstCancel).not.toHaveBeenCalled();

    expect(cancel('final-pass')).toBe(true);
    expect(firstCancel).toHaveBeenCalledWith('final-pass');

    expect(cancel('no-op')).toBe(false);
  });
});
