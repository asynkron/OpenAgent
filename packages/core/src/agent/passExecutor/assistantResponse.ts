import type { ChatMessageEntry } from '../historyEntry.js';
import {
  createObservationHistoryEntry,
  type ObservationParseAttempt,
  type ObservationRecord,
} from '../historyMessageBuilder.js';
import type { ParseFailure } from '../responseParser.js';
import type {
  AssistantResponseValidationResult,
  SchemaValidationResult,
} from '../responseValidator.js';
import type { DebugEmitter } from './debugEmitter.js';
import type { AssistantResponseResolution, ExecuteAgentPassOptions } from './types.js';
import type { PlanResponse } from '../../contracts/index.js';

interface ResponseEvaluationContext {
  responseContent: string;
  history: ChatMessageEntry[];
  passIndex: number;
  emitEvent: ExecuteAgentPassOptions['emitEvent'];
  emitDebug: DebugEmitter['emit'];
  parseAssistantResponseFn: Required<ExecuteAgentPassOptions>['parseAssistantResponseFn'];
  validateAssistantResponseSchemaFn: Required<ExecuteAgentPassOptions>['validateAssistantResponseSchemaFn'];
  validateAssistantResponseFn: Required<ExecuteAgentPassOptions>['validateAssistantResponseFn'];
}

const mapParseAttempts = (result: ParseFailure): ObservationParseAttempt[] => {
  if (!Array.isArray(result.attempts)) {
    return [];
  }

  return result.attempts.map(({ strategy, error }) => ({
    strategy,
    message: error instanceof Error ? error.message : String(error),
  }));
};

const pushObservation = ({
  history,
  passIndex,
  observation,
}: {
  history: ChatMessageEntry[];
  passIndex: number;
  observation: ObservationRecord;
}): void => {
  history.push(createObservationHistoryEntry({ observation, pass: passIndex }));
};

const handleParseFailure = (
  context: ResponseEvaluationContext,
  parseResult: ParseFailure,
): AssistantResponseResolution => {
  const attempts = mapParseAttempts(parseResult);

  context.emitEvent?.({
    type: 'error',
    payload: {
      message: 'LLM returned invalid JSON.',
      details:
        parseResult.error instanceof Error
          ? parseResult.error.message
          : String(parseResult.error ?? 'Unknown error'),
      raw: context.responseContent,
      attempts,
    },
  });

  pushObservation({
    history: context.history,
    passIndex: context.passIndex,
    observation: {
      observation_for_llm: {
        json_parse_error: true,
        message:
          'Failed to parse assistant JSON response. Please resend a valid JSON object that follows the CLI protocol.',
        attempts,
        response_snippet: context.responseContent.slice(0, 4000),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    },
  });

  return { status: 'retry' };
};

const handleSchemaFailure = (
  context: ResponseEvaluationContext,
  schemaValidation: SchemaValidationResult,
): AssistantResponseResolution => {
  const serializedErrors = schemaValidation.errors.map((error) => ({
    path: error.path,
    message: error.message,
    keyword: error.keyword,
    instancePath: error.instancePath,
    params: error.params,
  }));

  context.emitDebug(() => ({
    stage: 'assistant-response-schema-validation-error',
    message: 'Assistant response failed schema validation.',
    errors: serializedErrors,
    raw: context.responseContent,
  }));

  context.emitEvent?.({
    type: 'schema_validation_failed',
    payload: {
      message: 'Assistant response failed schema validation.',
      errors: serializedErrors,
      raw: context.responseContent,
    },
    message: 'Assistant response failed schema validation.',
    errors: serializedErrors,
    raw: context.responseContent,
  } as unknown as Parameters<NonNullable<typeof context.emitEvent>>[0]);

  const schemaMessages = schemaValidation.errors.map((error) => `${error.path}: ${error.message}`);
  const summary =
    schemaMessages.length === 1
      ? `Schema validation failed: ${schemaMessages[0]}`
      : `Schema validation failed. Please address the following issues:\n- ${schemaMessages.join('\n- ')}`;

  pushObservation({
    history: context.history,
    passIndex: context.passIndex,
    observation: {
      observation_for_llm: {
        schema_validation_error: true,
        message: summary,
        details: schemaMessages,
        response_snippet: context.responseContent.slice(0, 4000),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    },
  });

  return { status: 'retry' };
};

const handleValidationFailure = (
  context: ResponseEvaluationContext,
  validation: AssistantResponseValidationResult,
): AssistantResponseResolution => {
  const details = validation.errors.join(' ');

  context.emitDebug(() => ({
    stage: 'assistant-response-validation-error',
    message: 'Assistant response failed protocol validation.',
    details,
    errors: validation.errors,
    raw: context.responseContent,
  }));

  pushObservation({
    history: context.history,
    passIndex: context.passIndex,
    observation: {
      observation_for_llm: {
        response_validation_error: true,
        message:
          validation.errors.length === 1
            ? validation.errors[0]
            : `Detected ${validation.errors.length} validation issues. Please fix them and resend a compliant response.`,
        details: validation.errors,
        response_snippet: context.responseContent.slice(0, 4000),
      },
      observation_metadata: {
        timestamp: new Date().toISOString(),
      },
    },
  });

  return { status: 'retry' };
};

export const evaluateAssistantResponse = (
  context: ResponseEvaluationContext,
): AssistantResponseResolution => {
  const parseResult = context.parseAssistantResponseFn(context.responseContent);

  if (!parseResult.ok) {
    return handleParseFailure(context, parseResult);
  }

  const schemaValidation = context.validateAssistantResponseSchemaFn(parseResult.value);
  if (!schemaValidation.valid) {
    return handleSchemaFailure(context, schemaValidation);
  }

  const validation = context.validateAssistantResponseFn(parseResult.value);
  if (!validation.valid) {
    return handleValidationFailure(context, validation);
  }

  context.emitDebug(() => ({
    stage: 'assistant-response',
    parsed: parseResult.value,
  }));

  if (
    parseResult.recovery &&
    parseResult.recovery.strategy &&
    parseResult.recovery.strategy !== 'direct'
  ) {
  context.emitEvent?.({
    type: 'status',
    payload: {
      level: 'info',
      message: `Assistant JSON parsed after applying ${parseResult.recovery.strategy.replace(/_/g, ' ')} recovery.`,
      details: null,
    },
  });
  }

  const success = {
    status: 'success',
    parsed: parseResult.value as unknown as PlanResponse,
    responseContent: context.responseContent,
  } as const satisfies AssistantResponseResolution;

  return success;
};
