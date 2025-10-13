// @ts-nocheck
/* eslint-env jest */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

let mockGenerateObject;
let mockGenerateText;
let mockGetOpenAIRequestSettings;

beforeEach(() => {
  jest.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.OPENAI_REASONING_EFFORT;

  mockGenerateObject = jest.fn();
  mockGenerateText = jest.fn();
  mockGetOpenAIRequestSettings = jest.fn(() => ({ timeoutMs: null, maxRetries: null }));

  jest.unstable_mockModule('ai', () => ({
    generateObject: mockGenerateObject,
    generateText: mockGenerateText,
  }));

  jest.unstable_mockModule('../client.js', () => ({
    getOpenAIRequestSettings: mockGetOpenAIRequestSettings,
  }));
});

describe('createResponse', () => {
  test('omits reasoning when no environment configuration is present', async () => {
    mockGenerateText.mockResolvedValue({ text: 'hi' });
    const modelRef = {};
    const openai = {
      responses: jest.fn().mockReturnValue(modelRef),
    };

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [] });

    expect(openai.responses).toHaveBeenCalledWith('gpt-5-codex');
    expect(mockGenerateText).toHaveBeenCalledWith({
      model: modelRef,
      messages: [],
      providerOptions: undefined,
    });
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  test('parses AGENT_REASONING_EFFORT env for configured reasoning effort (no providerOptions)', async () => {
    process.env.AGENT_REASONING_EFFORT = 'High';
    mockGenerateText.mockResolvedValue({ text: 'ok' });
    const modelRef = {};
    const openai = { responses: jest.fn().mockReturnValue(modelRef) };

    const { createResponse, getConfiguredReasoningEffort } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [] });

    expect(mockGenerateText).toHaveBeenCalledWith({
      model: modelRef,
      messages: [],
      providerOptions: undefined,
    });
    expect(getConfiguredReasoningEffort()).toBe('high');
  });

  test('prefers explicit reasoning effort over environment value (still no providerOptions)', async () => {
    process.env.AGENT_REASONING_EFFORT = 'low';
    mockGenerateText.mockResolvedValue({ text: 'ok' });
    const modelRef = {};
    const openai = { responses: jest.fn().mockReturnValue(modelRef) };

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [], reasoningEffort: 'medium' });

    expect(mockGenerateText).toHaveBeenCalledWith({
      model: modelRef,
      messages: [],
      providerOptions: undefined,
    });
  });

  test('includes tools when provided', async () => {
    const modelRef = {};
    const openai = {
      responses: jest.fn().mockReturnValue(modelRef),
    };
    const tool = { name: 'example', description: 'desc', schema: { mock: true } };
    mockGenerateObject.mockResolvedValue({ object: { ok: true }, response: {} });

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [], tools: [tool] });

    expect(mockGenerateObject).toHaveBeenCalledWith({
      model: modelRef,
      messages: [],
      schema: tool.schema,
      schemaName: 'example',
      schemaDescription: 'desc',
      providerOptions: undefined,
    });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
