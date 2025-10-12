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
          id: 'step-1',
          title: 'Do the thing',
          status: 'pending',
          command: { shell: '/bin/bash', run: 'echo "hi"' },
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

  test('accepts active plan with pending step and command', () => {
    const result = validateAssistantResponse({
      message: 'Working',
      plan: [
        {
          id: 'step-1',
          title: 'Do the thing',
          status: 'pending',
          command: {
            shell: 'bash',
            run: 'echo "hello"',
          },
        },
        {
          id: 'step-2',
          title: 'Follow up',
          status: 'pending',
          command: { shell: 'bash', run: 'ls' },
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
      plan: [{ id: 'step-1', title: 'Only step', status: 'pending' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'plan[0] requires a non-empty command while the step is pending.',
    );
  });

  test('allows completed plan step without command', () => {
    const result = validateAssistantResponse({
      plan: [{ id: 'step-1', title: 'Done', status: 'completed' }],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('accepts plan with more than three top-level steps', () => {
    const result = validateAssistantResponse({
      plan: [
        { id: 'step-1', title: 'A', status: 'completed' },
        { id: 'step-2', title: 'B', status: 'completed' },
        { id: 'step-3', title: 'C', status: 'completed' },
        { id: 'step-4', title: 'D', status: 'completed' },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('accepts plan when open steps are pending', () => {
    const result = validateAssistantResponse({
      plan: [
        { id: 'step-1', title: 'A', status: 'completed' },
        {
          id: 'step-2',
          title: 'B',
          status: 'pending',
          command: { shell: '/bin/bash', run: 'echo two' },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
