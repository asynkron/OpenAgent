import {
  generateObject,
  generateText,
  type CallSettings,
  type GenerateObjectResult,
  type GenerateTextResult,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type { FlexibleSchema } from '@ai-sdk/provider-utils';
import { OPENAGENT_RESPONSE_TOOL } from '../agent/responseToolSchema.js';
import { getOpenAIRequestSettings } from './client.js';

type ReasoningEffort = 'low' | 'medium' | 'high';

const VALID_REASONING_EFFORTS = new Set<ReasoningEffort>(['low', 'medium', 'high']);

function normalizeReasoningEffort(value: string | null | undefined): ReasoningEffort | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase() as ReasoningEffort;
  return VALID_REASONING_EFFORTS.has(normalized) ? normalized : null;
}

// Provider-agnostic env var with backward-compatible alias
const RAW_REASONING = process.env.AGENT_REASONING_EFFORT ?? process.env.OPENAI_REASONING_EFFORT;
const ENV_REASONING_EFFORT = normalizeReasoningEffort(RAW_REASONING);

if (RAW_REASONING && !ENV_REASONING_EFFORT) {
  console.warn('Reasoning effort env must be one of: low, medium, high. Ignoring invalid value.');
}

export function getConfiguredReasoningEffort(): ReasoningEffort | null {
  return ENV_REASONING_EFFORT;
}

export interface ResponseCallOptions {
  signal?: AbortSignal;
  maxRetries?: number;
}

type ResponseCallSettings = Partial<Pick<CallSettings, 'abortSignal' | 'maxRetries'>>;

function buildCallSettings(options: ResponseCallOptions | undefined): ResponseCallSettings {
  const { maxRetries } = getOpenAIRequestSettings();

  const settings: ResponseCallSettings = {};

  if (options?.signal) {
    settings.abortSignal = options.signal;
  }

  if (typeof options?.maxRetries === 'number') {
    settings.maxRetries = options.maxRetries;
  }

  if (typeof settings.maxRetries === 'undefined' && typeof maxRetries === 'number') {
    settings.maxRetries = maxRetries;
  }

  return settings;
}

// Intentionally avoid provider-specific options to keep the core provider-agnostic
function buildProviderOptions(_reasoningEffort?: ReasoningEffort) {
  return undefined;
}

function mapToolToSchema(tool: SupportedTool | null | undefined): SupportedTool | null {
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

interface StructuredToolDefinition {
  name?: string;
  description?: string;
  schema: FlexibleSchema<unknown>;
}

type SupportedTool = typeof OPENAGENT_RESPONSE_TOOL | StructuredToolDefinition;

export type ResponsesProvider = (model: string) => LanguageModel;

type ResponsesFunction = ResponsesProvider & {
  responses?: ResponsesProvider;
};

export type ResponsesClient = { responses: ResponsesProvider } | ResponsesFunction;

function resolveResponsesModel(
  openaiProvider: ResponsesClient | undefined,
  model: string,
): LanguageModel | null {
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

interface ResponseFunctionCall {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string | null;
}

interface ResponseMessageContent {
  type: 'output_text';
  text: string;
}

interface ResponseMessage {
  type: 'message';
  role: 'assistant';
  content: ResponseMessageContent[];
}

type ResponseOutput = ResponseFunctionCall | ResponseMessage;

interface StructuredResponseResult {
  output_text: string;
  output: ResponseOutput[];
  structured: GenerateObjectResult<unknown>;
}

interface TextResponseResult {
  output_text: string;
  output: ResponseOutput[];
  text: GenerateTextResult<ToolSet, unknown>;
}

export type CreateResponseResult = StructuredResponseResult | TextResponseResult;

export interface CreateResponseParams {
  openai: ResponsesClient;
  model: string;
  input: ModelMessage[];
  tools?: SupportedTool[];
  options?: ResponseCallOptions;
  reasoningEffort?: ReasoningEffort;
}

export async function createResponse({
  openai,
  model,
  input,
  tools,
  options,
  reasoningEffort,
}: CreateResponseParams): Promise<CreateResponseResult> {
  const languageModel = resolveResponsesModel(openai, model);

  if (!languageModel) {
    throw new Error('Invalid OpenAI client instance provided.');
  }

  const callSettings = buildCallSettings(options);
  const providerOptions = buildProviderOptions(reasoningEffort);
  const messages = input;

  const tool = mapToolToSchema(tools?.[0]);

  if (tool?.schema) {
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
