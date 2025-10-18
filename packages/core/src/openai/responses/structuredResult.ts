import type { LanguageModel, ModelMessage } from 'ai';
import type { GenerateObjectResult } from 'ai';

import type { PlanObservation, PlanResponse, PlanStep } from '../../contracts/index.js';
import type { ProviderOptions, ResponseCallSettings } from './callSettings.js';
import type { StructuredToolDefinition } from './toolSelection.js';

export type CommandDraftStreamPartial = {
  reason?: string | null;
  shell?: string | null;
  run?: string | null;
  cwd?: string | null;
  timeout_sec?: number | null;
  filter_regex?: string | null;
  tail_lines?: number | null;
  max_bytes?: number | null;
};

export type PlanStepStreamPartial = {
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
  plan?: PlanStepStreamPartial[] | null;
};

interface StructuredStreamCallbacks {
  onPartial?: (value: PlanResponseStreamPartial) => void;
  onComplete?: () => void;
}

interface ResponseFunctionCall {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string | null;
}

export interface StructuredResponseResult {
  output_text: string;
  output: ResponseFunctionCall[];
  structured: GenerateObjectResult<PlanResponse>;
}

export async function createStructuredResult(
  languageModel: LanguageModel,
  messages: ModelMessage[],
  tool: StructuredToolDefinition,
  providerOptions: ProviderOptions,
  callSettings: ResponseCallSettings,
  callbacks: StructuredStreamCallbacks,
  streamObjectFn: typeof import('ai').streamObject,
): Promise<StructuredResponseResult> {
  const streamResult = streamObjectFn({
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
                onPartial(partial as PlanResponseStreamPartial);
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

  const [object, finishReason, usage, warnings, request, response, providerMetadata] =
    await Promise.all([
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
    responseRecord && typeof responseRecord.id === 'string' ? (responseRecord.id as string) : null;

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
