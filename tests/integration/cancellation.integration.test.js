import { jest } from '@jest/globals';

import { runCommand } from '../../src/commands/run.js';
import { cancel, getActiveOperation, register } from '../../src/utils/cancellation.js';

jest.setTimeout(20000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('cancellation manager integration', () => {
  afterEach(() => {
    // Ensure no stray operations remain registered between tests.
    const active = getActiveOperation();
    if (active) {
      cancel('test-cleanup');
    }
  });

  test('ESC-style cancellation terminates an in-flight shell command', async () => {
    // Spawn a long-lived node process so the cancellation stack has an active entry.
    const commandPromise = runCommand('node -e "setTimeout(() => {}, 2000)"', '.', 10);

    await sleep(100);

    const beforeCancel = getActiveOperation();
    expect(beforeCancel).not.toBeNull();
    expect(beforeCancel.description).toContain('shell');

    // Simulate hitting ESC by cancelling the active operation.
    const canceled = cancel('esc-key');
    expect(canceled).toBe(true);

    const result = await commandPromise;

    expect(result.killed).toBe(true);
    expect(result.stderr).toContain('Command was canceled.');
    expect(getActiveOperation()).toBeNull();
  });

  test('nested registrations preserve outer operations when inner command is canceled', async () => {
    const outerCancel = jest.fn();
    const outerHandle = register({ description: 'openai-request', onCancel: outerCancel });

    const commandPromise = runCommand('node -e "setTimeout(() => {}, 2000)"', '.', 10);
    await sleep(100);

    const topBeforeEsc = getActiveOperation();
    expect(topBeforeEsc).not.toBeNull();
    expect(topBeforeEsc.description).toContain('shell');

    const canceled = cancel('esc-key');
    expect(canceled).toBe(true);

    const result = await commandPromise;
    expect(result.killed).toBe(true);
    expect(result.stderr).toContain('Command was canceled.');

    // The outer OpenAI handle should still be active and uncanceled.
    const remaining = getActiveOperation();
    expect(remaining).not.toBeNull();
    expect(remaining.description).toBe('openai-request');
    expect(outerCancel).not.toHaveBeenCalled();

    outerHandle.unregister();
    expect(getActiveOperation()).toBeNull();
  });
});
