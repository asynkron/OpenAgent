import {
  generateText,
  streamObject,
  type CallSettings,
  type GenerateObjectResult,
  type GenerateTextResult,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type { FlexibleSchema } from '@ai-sdk/provider-utils';
import { ToolDefinition, type PlanResponse } from '../contracts/index.js';
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
type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

// Minimal deep-partial helper so stream callbacks surface the partially
// populated tool payload while matching the AI SDK's array semantics.
type DeepPartial<T> = T extends (...arguments_: any[]) => unknown
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U> | undefined>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type PlanResponseStreamPartial = DeepPartial<PlanResponse>;

// Normalize optional runtime knobs into the shape expected by the AI SDK helpers.
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

function buildProviderOptions(_reasoningEffort?: ReasoningEffort): ProviderOptions {
  // Always enable strict JSON Schema for provider calls
  return { openai: { strictJsonSchema: true } } as ProviderOptions;
}

function mapToolToSchema(tool: SupportedTool | null | undefined): StructuredToolDefinition | null {
  if (!tool || typeof tool !== 'object') {
    return null;
  }

  if (tool === ToolDefinition) {
    return ToolDefinition;
  }

  if (tool.schema) {
    return tool;
  }

  return null;
}

interface StructuredToolDefinition {
  name?: string;
  description?: string;
  schema: FlexibleSchema<PlanResponse>;
}

type SupportedTool = typeof ToolDefinition | StructuredToolDefinition;

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
  structured: GenerateObjectResult<PlanResponse>;
}

interface TextResponseResult {
  output_text: string;
  output: ResponseOutput[];
  text: GenerateTextResult<ToolSet, string>;
}

export type CreateResponseResult = StructuredResponseResult | TextResponseResult;

export interface CreateResponseParams {
  openai: ResponsesClient;
  model: string;
  input: ModelMessage[];
  tools?: SupportedTool[];
  options?: ResponseCallOptions;
  reasoningEffort?: ReasoningEffort;
  onStructuredStreamPartial?: (value: PlanResponseStreamPartial) => void;
  onStructuredStreamFinish?: () => void;
}

// Throw a predictable error instead of propagating null checks through every call site.
function requireResponsesModel(openaiProvider: ResponsesClient | undefined, model: string): LanguageModel {
  const languageModel = resolveResponsesModel(openaiProvider, model);
  if (!languageModel) {
    throw new Error('Invalid OpenAI client instance provided.');
  }
  return languageModel;
}

// Only the first tool is considered right now; keep the selection logic centralized so we
// can relax that constraint later without touching `createResponse`.
function selectStructuredTool(tools: SupportedTool[] | undefined): StructuredToolDefinition | null {
  if (!tools || tools.length === 0) {
    return null;
  }

  return mapToolToSchema(tools[0]);
}

interface StructuredStreamCallbacks {
  onPartial?: (value: PlanResponseStreamPartial) => void;
  onComplete?: () => void;
}

// Shared helper so both code paths emit the same response envelope.
async function createStructuredResult(
  languageModel: LanguageModel,
  messages: ModelMessage[],
  tool: StructuredToolDefinition,
  providerOptions: ProviderOptions,
  callSettings: ResponseCallSettings,
  callbacks: StructuredStreamCallbacks = {},
): Promise<StructuredResponseResult> {
  const streamResult = streamObject({
    model: languageModel,
    messages,
    schema: tool.schema,
    schemaName: typeof tool.name === 'string' ? tool.name : undefined,
    schemaDescription: typeof tool.description === 'string' ? tool.description : undefined,
    providerOptions,
    ...callSettings,
  });

  const { onPartial, onComplete } = callbacks;
  let completionNotified = false;

  const notifyComplete = (): void => {
    if (completionNotified) {
      return;
    }
    completionNotified = true;
    try {
      onComplete?.();
    } catch (_error) {
      // Ignore completion handler failures so we never block the response.
    }
  };

  const streamTask =
    typeof onPartial === 'function'
      ? (async () => {
          try {
            for await (const partial of streamResult.partialObjectStream) {
              try {
                onPartial(partial);
              } catch (_error) {
                // Swallow downstream handler failures to keep streaming resilient.
              }
            }
          } catch (_error) {
            // Surface fatal errors through the awaited object below; ignore here.
          } finally {
            notifyComplete();
          }
        })()
      : null;

  const [
    object,
    finishReason,
    usage,
    warnings,
    request,
    response,
    providerMetadata,
  ] = await Promise.all([
    streamResult.object,
    streamResult.finishReason,
    streamResult.usage,
    streamResult.warnings,
    streamResult.request,
    streamResult.response,
    streamResult.providerMetadata,
  ]);

  await streamTask?.catch(() => {});
  notifyComplete();

  const argumentsText = JSON.stringify(object);
  const responseRecord = response as Record<string, unknown>;
  const callId =
    responseRecord && typeof responseRecord.id === 'string'
      ? (responseRecord.id as string)
      : null;

  const structured: GenerateObjectResult<PlanResponse> = {
    object,
    reasoning: undefined,
    finishReason,
    usage,
    warnings,
    request,
    response: response as GenerateObjectResult<PlanResponse>['response'],
    providerMetadata,
    toJsonResponse(init?: ResponseInit): Response {
      const status = typeof init?.status === 'number' ? init.status : 200;
      const headers = new Headers(init?.headers);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json; charset=utf-8');
      }
      return new Response(JSON.stringify(object), { ...init, status, headers });
    },
  };

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

async function createTextResult(
  languageModel: LanguageModel,
  messages: ModelMessage[],
  providerOptions: ProviderOptions,
  callSettings: ResponseCallSettings,
): Promise<TextResponseResult> {
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

export async function createResponse({
  openai,
  model,
  input,
  tools,
  options,
  reasoningEffort,
  onStructuredStreamPartial,
  onStructuredStreamFinish,
}: CreateResponseParams): Promise<CreateResponseResult> {
  const languageModel = requireResponsesModel(openai, model);
  const callSettings = buildCallSettings(options);
  const providerOptions = buildProviderOptions(reasoningEffort);
  const tool = selectStructuredTool(tools);

  if (tool?.schema) {
    return createStructuredResult(languageModel, input, tool, providerOptions, callSettings, {
      onPartial: onStructuredStreamPartial,
      onComplete: onStructuredStreamFinish,
    });
  }

  return createTextResult(languageModel, input, providerOptions, callSettings);
}

export default {
  createResponse,
  getConfiguredReasoningEffort,
};
