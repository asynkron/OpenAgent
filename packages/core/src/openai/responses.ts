// @ts-nocheck
import { generateObject, generateText } from 'ai';
import { OPENAGENT_RESPONSE_TOOL } from '../agent/responseToolSchema.js';
import { getOpenAIRequestSettings } from './client.js';

const VALID_REASONING_EFFORTS = new Set(['low', 'medium', 'high']);

function normalizeReasoningEffort(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_REASONING_EFFORTS.has(normalized) ? normalized : null;
}

const ENV_REASONING_EFFORT = normalizeReasoningEffort(process.env.OPENAI_REASONING_EFFORT);

if (process.env.OPENAI_REASONING_EFFORT && !ENV_REASONING_EFFORT) {
  console.warn(
    'OPENAI_REASONING_EFFORT is set but must be one of: low, medium, high. Ignoring invalid value.',
  );
}

export function getConfiguredReasoningEffort() {
  return ENV_REASONING_EFFORT;
}

function buildCallSettings(options) {
  const { maxRetries } = getOpenAIRequestSettings();

  const settings = {};

  if (options && typeof options === 'object') {
    if (options.signal) {
      settings.abortSignal = options.signal;
    }

    if (typeof options.maxRetries === 'number') {
      settings.maxRetries = options.maxRetries;
    }
  }

  if (typeof settings.maxRetries === 'undefined' && typeof maxRetries === 'number') {
    settings.maxRetries = maxRetries;
  }

  return settings;
}

function buildProviderOptions(reasoningEffort) {
  const normalized = normalizeReasoningEffort(reasoningEffort) ?? ENV_REASONING_EFFORT;
  if (!normalized) {
    return undefined;
  }

  return { openai: { reasoningEffort: normalized } };
}

function mapToolToSchema(tool) {
  if (!tool || typeof tool !== 'object') {
    return null;
  }

  if (tool === OPENAGENT_RESPONSE_TOOL) {
    return OPENAGENT_RESPONSE_TOOL;
  }

  if (tool.schema) {
    return tool;
  }

  return null;
}

function resolveResponsesModel(openaiProvider, model) {
  if (!openaiProvider) {
    return null;
  }

  if (typeof openaiProvider === 'function') {
    if (typeof openaiProvider.responses === 'function') {
      return openaiProvider.responses(model);
    }

    return openaiProvider(model);
  }

  if (typeof openaiProvider === 'object' && typeof openaiProvider.responses === 'function') {
    return openaiProvider.responses(model);
  }

  return null;
}

export async function createResponse({
  openai,
  model,
  input,
  tools,
  options,
  reasoningEffort,
}) {
  const languageModel = resolveResponsesModel(openai, model);

  if (!languageModel) {
    throw new Error('Invalid OpenAI client instance provided.');
  }

  const callSettings = buildCallSettings(options);
  const providerOptions = buildProviderOptions(reasoningEffort);
  const messages = Array.isArray(input) ? input : [];

  const tool = Array.isArray(tools) && tools.length > 0 ? mapToolToSchema(tools[0]) : null;

  if (tool && tool.schema) {
    const structured = await generateObject({
      model: languageModel,
      messages,
      schema: tool.schema,
      schemaName: typeof tool.name === 'string' ? tool.name : undefined,
      schemaDescription: typeof tool.description === 'string' ? tool.description : undefined,
      providerOptions,
      ...callSettings,
    });

    const argumentsText = JSON.stringify(structured.object);
    const callId =
      structured.response && typeof structured.response.id === 'string'
        ? structured.response.id
        : null;

    return {
      output_text: argumentsText,
      output: [
        {
          type: 'function_call',
          name: tool.name ?? 'open-agent',
          arguments: argumentsText,
          call_id: callId,
        },
      ],
      structured,
    };
  }

  const textResult = await generateText({
    model: languageModel,
    messages,
    providerOptions,
    ...callSettings,
  });

  const normalizedText = typeof textResult.text === 'string' ? textResult.text : '';

  return {
    output_text: normalizedText,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: normalizedText,
          },
        ],
      },
    ],
    text: textResult,
  };
}

export default {
  createResponse,
  getConfiguredReasoningEffort,
};
