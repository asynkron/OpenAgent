/* eslint-env jest */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

let mockGenerateText: jest.Mock;
let mockStreamObject: jest.Mock;
let mockGetOpenAIRequestSettings: jest.Mock;

beforeEach(() => {
  jest.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.OPENAI_REASONING_EFFORT;

  mockGenerateText = jest.fn();
  mockStreamObject = jest.fn(() => ({
    partialObjectStream: (async function* partialStream() {})(),
    object: Promise.resolve({}),
    finishReason: Promise.resolve('stop'),
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    warnings: Promise.resolve(undefined),
    request: Promise.resolve({}),
    response: Promise.resolve({}),
    providerMetadata: Promise.resolve(undefined),
  }));
  mockGetOpenAIRequestSettings = jest.fn(() => ({ timeoutMs: null, maxRetries: null }));

  jest.unstable_mockModule('ai', () => ({
    generateText: mockGenerateText,
    streamObject: mockStreamObject,
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
      providerOptions: { openai: { strictJsonSchema: true } },
    });
    expect(mockStreamObject).not.toHaveBeenCalled();
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
      providerOptions: { openai: { strictJsonSchema: true } },
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
      providerOptions: { openai: { strictJsonSchema: true } },
    });
  });

  test('includes tools when provided', async () => {
    const modelRef = {};
    const openai = {
      responses: jest.fn().mockReturnValue(modelRef),
    };
    const tool = { name: 'example', description: 'desc', schema: { mock: true } };
    mockStreamObject.mockImplementation(() => ({
      partialObjectStream: (async function* partialStream() {})(),
      object: Promise.resolve({ ok: true }),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }),
      warnings: Promise.resolve(undefined),
      request: Promise.resolve({}),
      response: Promise.resolve({ id: 'resp-1' }),
      providerMetadata: Promise.resolve(undefined),
    }));

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [], tools: [tool] });

    expect(mockStreamObject).toHaveBeenCalledWith({
      model: modelRef,
      messages: [],
      schema: tool.schema,
      schemaName: 'example',
      schemaDescription: 'desc',
      providerOptions: { openai: { strictJsonSchema: true } },
    });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
