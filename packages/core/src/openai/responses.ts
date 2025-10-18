import { streamObject } from 'ai';
import type { ModelMessage } from 'ai';

import {
  buildCallSettings,
  buildProviderOptions,
  getConfiguredReasoningEffort,
  type ProviderOptions,
  type ReasoningEffort,
  type ResponseCallOptions,
  type ResponseCallSettings,
} from './responses/callSettings.js';
import {
  requireResponsesModel,
  type ResponsesClient,
  type ResponsesProvider,
} from './responses/modelResolution.js';
import {
  createStructuredResult,
  type PlanResponseStreamPartial,
  type StructuredResponseResult,
} from './responses/structuredResult.js';
import {
  selectStructuredTool,
  type StructuredToolDefinition,
  type SupportedTool,
} from './responses/toolSelection.js';
import { createTextResult, type TextResponseResult } from './responses/textResult.js';

export type {
  ReasoningEffort,
  ResponseCallOptions,
  ResponsesClient,
  ResponsesProvider,
  PlanResponseStreamPartial,
  SupportedTool,
};
export { getConfiguredReasoningEffort } from './responses/callSettings.js';

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
  const callSettings: ResponseCallSettings = buildCallSettings(options);
  const providerOptions: ProviderOptions = buildProviderOptions(reasoningEffort);
  const selectedTool: StructuredToolDefinition | null = selectStructuredTool(tools);
  const toolForStructuredResponse: StructuredToolDefinition | null =
    selectedTool ?? coerceStructuredTool(tools);
  if (toolForStructuredResponse?.schema) {
    return createStructuredResult(
      languageModel,
      input,
      toolForStructuredResponse,
      providerOptions,
      callSettings,
      {
        onPartial: onStructuredStreamPartial,
        onComplete: onStructuredStreamFinish,
      },
      streamObject,
    );
  }

  return createTextResult(languageModel, input, providerOptions, callSettings);
}

function coerceStructuredTool(tools: SupportedTool[] | undefined): StructuredToolDefinition | null {
  if (!tools || tools.length === 0) {
    return null;
  }

  const [first] = tools;
  if (first && typeof first === 'object' && 'schema' in first && first.schema) {
    return first as StructuredToolDefinition;
  }

  return null;
}

export default {
  createResponse,
  getConfiguredReasoningEffort,
};
