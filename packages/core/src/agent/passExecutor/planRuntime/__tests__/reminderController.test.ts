/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';
import { createRuntimeReminderController } from '../reminderController.js';

describe('createRuntimeReminderController', () => {
  test('wraps a provided tracker', () => {
    let count = 0;
    const tracker = {
      increment: () => ++count,
      reset: () => {
        count = 0;
      },
      getCount: () => count,
    };

    const reminder = createRuntimeReminderController(tracker);
    expect(reminder.recordAttempt()).toBe(1);
    expect(reminder.getCount()).toBe(1);
    expect(reminder.hasReachedLimit(1)).toBe(true);
    reminder.reset();
    expect(reminder.getCount()).toBe(0);
  });

  test('provides a fallback implementation', () => {
    const reminder = createRuntimeReminderController(null);
    expect(reminder.getCount()).toBe(0);
    reminder.recordAttempt();
    reminder.recordAttempt();
    expect(reminder.getCount()).toBe(2);
    expect(reminder.hasReachedLimit(3)).toBe(false);
  });

  test('tracks counts when tracker omits getCount', () => {
    let count = 0;
    const tracker = {
      increment: () => ++count,
      reset: () => {
        count = 0;
      },
    } as const;

    const reminder = createRuntimeReminderController(tracker);
    expect(reminder.getCount()).toBe(0);
    expect(reminder.recordAttempt()).toBe(1);
    expect(reminder.getCount()).toBe(1);
    reminder.reset();
    expect(reminder.getCount()).toBe(0);
  });
});
