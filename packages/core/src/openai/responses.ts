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
import {
  ToolDefinition,
  type PlanObservation,
  type PlanResponse,
  type PlanStep,
} from '../contracts/index.js';
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

type CommandDraftStreamPartial = {
  reason?: string;
  shell?: string;
  run?: string;
  cwd?: string;
  timeout_sec?: number;
  filter_regex?: string;
  tail_lines?: number;
  max_bytes?: number;
};

type PlanStepStreamPartial = {
  id?: PlanStep['id'];
  title?: PlanStep['title'];
  status?: PlanStep['status'];
  waitingForId?: PlanStep['waitingForId'];
  command?: CommandDraftStreamPartial | null;
  observation?: PlanObservation | null;
  priority?: number | null;
};

export type PlanResponseStreamPartial = {
  message?: PlanResponse['message'];
  plan?: PlanStepStreamPartial[];
};

const isStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    entries.push(item);
  }
  return entries;
};

const normalizeCommandPartial = (value: unknown): CommandDraftStreamPartial | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const command: CommandDraftStreamPartial = {};

  if (typeof record.reason === 'string') command.reason = record.reason;
  if (typeof record.shell === 'string') command.shell = record.shell;
  if (typeof record.run === 'string') command.run = record.run;
  if (typeof record.cwd === 'string') command.cwd = record.cwd;
  if (typeof record.timeout_sec === 'number' && Number.isFinite(record.timeout_sec)) {
    command.timeout_sec = record.timeout_sec;
  }
  if (typeof record.filter_regex === 'string') command.filter_regex = record.filter_regex;
  if (typeof record.tail_lines === 'number' && Number.isFinite(record.tail_lines)) {
    command.tail_lines = record.tail_lines;
  }
  if (typeof record.max_bytes === 'number' && Number.isFinite(record.max_bytes)) {
    command.max_bytes = record.max_bytes;
  }

  return Object.keys(command).length > 0 ? command : {};
};

const normalizePlanStepPartial = (value: unknown): PlanStepStreamPartial | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const step: PlanStepStreamPartial = {};

  if (typeof record.id === 'string') step.id = record.id;
  if (typeof record.title === 'string') step.title = record.title;
  if (typeof record.status === 'string') step.status = record.status as PlanStep['status'];

  const waitingIds = isStringArray(record.waitingForId);
  if (waitingIds) {
    step.waitingForId = waitingIds;
  }

  if ('command' in record) {
    if (record.command === null) {
      step.command = null;
    } else {
      const command = normalizeCommandPartial(record.command);
      if (command) {
        step.command = command;
      }
    }
  }

  if ('observation' in record) {
    const observation = record.observation;
    if (observation === null || typeof observation === 'object') {
      step.observation = observation as PlanObservation | null;
    }
  }

  if (typeof record.priority === 'number' && Number.isFinite(record.priority)) {
    step.priority = record.priority;
  }

  return Object.keys(step).length > 0 ? step : {};
};

const normalizePlanResponsePartial = (value: unknown): PlanResponseStreamPartial => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  const response: PlanResponseStreamPartial = {};

  if (typeof record.message === 'string') {
    response.message = record.message;
  }

  if (Array.isArray(record.plan)) {
    const steps: PlanStepStreamPartial[] = [];
    for (const entry of record.plan) {
      const normalized = normalizePlanStepPartial(entry);
      if (normalized) {
        steps.push(normalized);
      }
    }
    response.plan = steps;
  }

  return response;
};

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
                onPartial(normalizePlanResponsePartial(partial));
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
