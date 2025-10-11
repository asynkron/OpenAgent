/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import {
  validateAssistantResponseSchema,
  validateAssistantResponse,
} from '../responseValidator.js';

describe('validateAssistantResponseSchema', () => {
  test('accepts payload matching schema', () => {
    const result = validateAssistantResponseSchema({
      message: 'Ready',
      plan: [
        {
          step: '1',
          title: 'Do the thing',
          status: 'running',
          command: { run: 'echo "hi"' },
        },
      ],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('flags missing required message property', () => {
    const result = validateAssistantResponseSchema({
      plan: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'response',
          message: 'Missing required property "message".',
        }),
      ]),
    );
  });
});

describe('validateAssistantResponse', () => {
  test('accepts minimal valid payload', () => {
    const result = validateAssistantResponse({
      message: 'Ready',
      plan: [],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('accepts payload with null message', () => {
    const result = validateAssistantResponse({
      message: null,
      plan: [],
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
          command: {
            shell: 'bash',
            run: 'echo "hello"',
          },
        },
        {
          step: '2',
          title: 'Follow up',
          status: 'pending',
          command: { run: 'ls' },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('flags invalid plan type', () => {
    const result = validateAssistantResponse({
      message: 'Oops',
      plan: 'not-an-array',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"plan" must be an array.');
  });

  test('requires command when plan has open steps', () => {
    const result = validateAssistantResponse({
      plan: [{ step: '1', title: 'Only step', status: 'running' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('plan[0] requires a non-empty command while the step is running.');
  });

  test('allows completed plan step without command', () => {
    const result = validateAssistantResponse({
      plan: [{ step: '1', title: 'Done', status: 'completed' }],
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
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Plan must not contain more than 3 top-level steps.');
  });

  test('ensures the first open step is marked running', () => {
    const result = validateAssistantResponse({
      plan: [
        { step: '1', title: 'A', status: 'pending', command: { run: 'echo one' } },
        { step: '2', title: 'B', status: 'running', command: { run: 'echo two' } },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('The next pending plan step must be marked as "running".');
  });
});
