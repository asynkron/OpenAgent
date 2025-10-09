import { jest } from '@jest/globals';
import { PromptCoordinator } from '../../src/agent/promptCoordinator.js';

describe('PromptCoordinator.handleCancel', () => {
  it('does not trigger ESC state or emit cancellation when no waiters are registered', () => {
    const cancelFn = jest.fn();
    const emitEvent = jest.fn();
    const trigger = jest.fn();
    const promptCoordinator = new PromptCoordinator({
      emitEvent,
      cancelFn,
      escState: { waiters: new Set(), trigger },
    });

    promptCoordinator.handleCancel();

    expect(cancelFn).toHaveBeenCalledWith('ui-cancel');
    expect(trigger).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        level: 'warn',
        message: 'Cancellation requested by UI.',
      }),
    );
  });

  it('triggers ESC state and emits cancellation when waiters are registered', () => {
    const cancelFn = jest.fn();
    const emitEvent = jest.fn();
    const trigger = jest.fn();
    const waiter = () => {};
    const escState = { waiters: new Set([waiter]), trigger };
    const promptCoordinator = new PromptCoordinator({
      emitEvent,
      cancelFn,
      escState,
    });

    promptCoordinator.handleCancel({ reason: 'ui-cancel' });

    expect(cancelFn).toHaveBeenCalledWith('ui-cancel');
    expect(trigger).toHaveBeenCalledWith({ reason: 'ui-cancel' });
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'status',
      level: 'warn',
      message: 'Cancellation requested by UI.',
    });
  });
});
