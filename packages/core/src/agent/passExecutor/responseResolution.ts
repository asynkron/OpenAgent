import { evaluateAssistantResponse } from './assistantResponse.js';
import type { DebugEmitter } from './debugEmitter.js';
import type {
  NormalizedExecuteAgentPassOptions,
  AssistantResponseSuccess as AssistantSuccess,
} from './types.js';
import type { PrePassSequenceResult } from './prePassSequence.js';

export type AssistantResolution =
  | { status: 'canceled' }
  | { status: 'schema-failed'; reason: 'missing-content' | 'validation' }
  | ({ status: 'success' } & AssistantSuccess);

export const resolveAssistantResponse = ({
  prePassResult,
  options,
  debugEmitter,
}: {
  prePassResult: PrePassSequenceResult;
  options: NormalizedExecuteAgentPassOptions;
  debugEmitter: DebugEmitter;
}): AssistantResolution => {
  if (prePassResult.status === 'canceled') {
    return { status: 'canceled' };
  }

  if (prePassResult.status === 'missing-content') {
    return { status: 'schema-failed', reason: 'missing-content' };
  }

  const resolution = evaluateAssistantResponse({
    responseContent: prePassResult.responseContent,
    history: options.history,
    passIndex: options.passIndex,
    emitEvent: options.emitEvent,
    emitDebug: debugEmitter.emit,
    parseAssistantResponseFn: options.parseAssistantResponseFn,
    validateAssistantResponseSchemaFn: options.validateAssistantResponseSchemaFn,
    validateAssistantResponseFn: options.validateAssistantResponseFn,
  });

  if (resolution.status !== 'success') {
    return { status: 'schema-failed', reason: 'validation' };
  }

  return { status: 'success', ...resolution };
};
