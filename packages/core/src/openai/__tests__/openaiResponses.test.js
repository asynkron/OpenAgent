/* eslint-env jest */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.OPENAI_REASONING_EFFORT;
});

describe('createResponse', () => {
  test('omits reasoning when no environment configuration is present', async () => {
    const openai = {
      responses: {
        create: jest.fn().mockResolvedValue({ output: [] }),
      },
    };

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [] });

    expect(openai.responses.create).toHaveBeenCalledWith(
      {
        model: 'gpt-5-codex',
        input: [],
      },
      undefined,
    );
  });

  test('includes reasoning effort sourced from the environment', async () => {
    process.env.OPENAI_REASONING_EFFORT = 'High';

    const openai = {
      responses: {
        create: jest.fn().mockResolvedValue({ output: [] }),
      },
    };

    const { createResponse, getConfiguredReasoningEffort } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [] });

    expect(openai.responses.create).toHaveBeenCalledWith(
      {
        model: 'gpt-5-codex',
        input: [],
        reasoning: { effort: 'high' },
      },
      undefined,
    );
    expect(getConfiguredReasoningEffort()).toBe('high');
  });

  test('prefers explicit reasoning effort over environment value', async () => {
    process.env.OPENAI_REASONING_EFFORT = 'low';

    const openai = {
      responses: {
        create: jest.fn().mockResolvedValue({ output: [] }),
      },
    };

    const { createResponse } = await import('../responses.js');
    await createResponse({
      openai,
      model: 'gpt-5-codex',
      input: [],
      reasoningEffort: 'medium',
    });

    expect(openai.responses.create).toHaveBeenCalledWith(
      {
        model: 'gpt-5-codex',
        input: [],
        reasoning: { effort: 'medium' },
      },
      undefined,
    );
  });

  test('includes tools when provided', async () => {
    const tool = {
      type: 'function',
      function: { name: 'example', parameters: { type: 'object' } },
    };
    const openai = {
      responses: {
        create: jest.fn().mockResolvedValue({ output: [] }),
      },
    };

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [], tools: [tool] });

    expect(openai.responses.create).toHaveBeenCalledWith(
      {
        model: 'gpt-5-codex',
        input: [],
        tools: [tool],
        tool_choice: {
          type: 'function',
          name: 'open-agent',
        },
      },
      undefined,
    );
  });
});
