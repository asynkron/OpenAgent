/* eslint-env jest */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

interface GenerateTextParams {
  model: string | object;
  messages: object[];
  providerOptions?: {
    openai?: {
      strictJsonSchema?: boolean;
    };
  };
  tools?: object;
}

interface StreamObjectUsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface StreamObjectResultShape {
  partialObjectStream: AsyncIterable<never>;
  object: Promise<object>;
  finishReason: Promise<string>;
  usage: Promise<StreamObjectUsageTotals>;
  warnings: Promise<undefined>;
  request: Promise<object>;
  response: Promise<object>;
  providerMetadata: Promise<undefined>;
}

interface StreamObjectParams {
  model: string | object;
  messages: object[];
  schema?: object;
  schemaName?: string;
  schemaDescription?: string;
  providerOptions?: {
    openai?: {
      strictJsonSchema?: boolean;
      reasoning?: {
        effort?: string;
      };
    };
  };
}

type GenerateTextMock = jest.Mock<Promise<{ text: string }>, [GenerateTextParams]>;
type StreamObjectMock = jest.Mock<StreamObjectResultShape, [StreamObjectParams]>;
type RequestSettingsMock = jest.Mock<{ timeoutMs: number | null; maxRetries: number | null }, []>;

let mockGenerateText: GenerateTextMock;
let mockStreamObject: StreamObjectMock;
let mockGetOpenAIRequestSettings: RequestSettingsMock;

beforeEach(() => {
  jest.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.OPENAI_REASONING_EFFORT;

  mockGenerateText = jest.fn(async () => ({ text: '' })) as GenerateTextMock;
  mockStreamObject = jest.fn(() => ({
    partialObjectStream: (async function* partialStream() {
      // empty stream for tests
    })(),
    object: Promise.resolve({}),
    finishReason: Promise.resolve('stop'),
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    warnings: Promise.resolve(undefined),
    request: Promise.resolve({}),
    response: Promise.resolve({}),
    providerMetadata: Promise.resolve(undefined),
  })) as StreamObjectMock;
  mockGetOpenAIRequestSettings = jest
    .fn(() => ({ timeoutMs: null, maxRetries: null }))
    .mockName('getOpenAIRequestSettings') as RequestSettingsMock;

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
    const modelRef: {} = {};
    const openai = {
      responses: jest.fn((model: string) => {
        expect(typeof model).toBe('string');
        return modelRef;
      }),
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
    const modelRef: {} = {};
    const openai = { responses: jest.fn((_model: string) => modelRef) };

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
    const modelRef: {} = {};
    const openai = { responses: jest.fn((_model: string) => modelRef) };

    const { createResponse } = await import('../responses.js');
    await createResponse({ openai, model: 'gpt-5-codex', input: [], reasoningEffort: 'medium' });

    expect(mockGenerateText).toHaveBeenCalledWith({
      model: modelRef,
      messages: [],
      providerOptions: { openai: { strictJsonSchema: true } },
    });
  });

  test('includes tools when provided', async () => {
    const modelRef: {} = {};
    const openai = {
      responses: jest.fn((_model: string) => modelRef),
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

  test('forwards abort signal to generateText when provided', async () => {
    mockGenerateText.mockResolvedValue({ text: 'ok' });
    const modelRef: {} = {};
    const openai = {
      responses: jest.fn((_model: string) => modelRef),
    };
    const controller = new AbortController();

    const { createResponse } = await import('../responses.js');
    await createResponse({
      openai,
      model: 'gpt-5-codex',
      input: [],
      options: { signal: controller.signal },
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });

  test('forwards abort signal to streamObject when provided', async () => {
    const tool = { name: 'example', description: 'desc', schema: { mock: true } };
    const modelRef: {} = {};
    const openai = {
      responses: jest.fn((_model: string) => modelRef),
    };
    const controller = new AbortController();

    const { createResponse } = await import('../responses.js');
    await createResponse({
      openai,
      model: 'gpt-5-codex',
      input: [],
      tools: [tool],
      options: { signal: controller.signal },
    });

    expect(mockStreamObject).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });
});
