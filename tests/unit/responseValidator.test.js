import { describe, expect, test } from '@jest/globals';

import { validateAssistantResponse } from '../../src/agent/responseValidator.js';

describe('validateAssistantResponse', () => {
  test('accepts minimal valid payload', () => {
    const result = validateAssistantResponse({
      message: 'Ready',
      plan: [],
      command: null,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('accepts payload with null message', () => {
    const result = validateAssistantResponse({
      message: null,
      plan: [],
      command: null,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('accepts active plan with running step and command', () => {
    const result = validateAssistantResponse({
      message: 'Working',
      plan: [
        {
          step: '1',
          title: 'Do the thing',
          status: 'running',
        },
        {
          step: '2',
          title: 'Follow up',
          status: 'pending',
        },
      ],
      command: {
        shell: 'bash',
        run: 'echo "hello"',
      },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('flags invalid plan type', () => {
    const result = validateAssistantResponse({
      message: 'Oops',
      plan: 'not-an-array',
      command: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"plan" must be an array.');
  });

  test('requires command when plan has open steps', () => {
    const result = validateAssistantResponse({
      plan: [
        { step: '1', title: 'Only step', status: 'running' },
      ],
      command: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Active plans require a "command" to execute next.');
  });

  test('allows command when no plan is active', () => {
    const result = validateAssistantResponse({
      plan: [],
      command: { run: 'echo "hi"' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('limits top-level plan size', () => {
    const result = validateAssistantResponse({
      plan: [
        { step: '1', title: 'A', status: 'completed' },
        { step: '2', title: 'B', status: 'completed' },
        { step: '3', title: 'C', status: 'completed' },
        { step: '4', title: 'D', status: 'completed' },
      ],
      command: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Plan must not contain more than 3 top-level steps.');
  });

  test('ensures the first open step is marked running', () => {
    const result = validateAssistantResponse({
      plan: [
        { step: '1', title: 'A', status: 'pending' },
        { step: '2', title: 'B', status: 'running' },
      ],
      command: { run: 'echo "hi"' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('The next pending plan step must be marked as "running".');
  });
});
