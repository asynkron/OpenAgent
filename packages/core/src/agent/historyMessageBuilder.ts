/**
 * History message helpers shared across the agent runtime.
 *
 * Responsibilities:
 * - Format observation payloads into OpenAI-safe chat message entries.
 * - Provide canned auto-response entries for plan reminders and refusal nudges.
 *
 * Consumers:
 * - History compaction, pass execution, and OpenAI request builders.
 *
 * Note: The runtime still imports the compiled `historyMessageBuilder.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import { createChatMessageEntry } from './historyEntry.js';

const JSON_INDENT = 2 as const;

export type JsonLike = Record<string, unknown>;

export type PlanSummary = Array<Record<string, unknown>>;

export interface ObservationParseAttempt {
  strategy: string;
  message: string;
  [key: string]: string;
}

export interface CommandOutputObservationForLLM {
  stdout: string;
  stderr: string;
  truncated: boolean;
  truncation_notice?: string;
  exit_code?: number;
}

export interface JsonParseErrorObservationForLLM {
  json_parse_error: true;
  message: string;
  attempts: ObservationParseAttempt[];
  response_snippet: string;
}

export interface SchemaValidationErrorObservationForLLM {
  schema_validation_error: true;
  message: string;
  details: string[];
  response_snippet: string;
}

export interface ResponseValidationErrorObservationForLLM {
  response_validation_error: true;
  message: string;
  details: string[];
  response_snippet: string;
}

export interface PlanObservationForLLM {
  plan: PlanSummary;
}

export interface CommandRejectedObservationForLLM {
  canceled_by_human: true;
  message: string;
}

export interface OperationCanceledObservationForLLM {
  operation_canceled: true;
  reason: string;
  message: string;
}

export type ObservationForLLM =
  | CommandOutputObservationForLLM
  | JsonParseErrorObservationForLLM
  | SchemaValidationErrorObservationForLLM
  | ResponseValidationErrorObservationForLLM
  | PlanObservationForLLM
  | CommandRejectedObservationForLLM
  | OperationCanceledObservationForLLM;

export interface ObservationMetadata extends JsonLike {}

export interface ObservationRecord extends JsonLike {
  observation_for_llm?: ObservationForLLM | null;
  observation_metadata?: ObservationMetadata | null;
}

export interface ObservationInput {
  observation?: ObservationRecord | null;
  command?: Record<string, unknown> | null;
}

export interface ObservationHistoryEntryInput extends ObservationInput {
  pass: number;
}

export interface AutoResponseInput {
  pass: number;
  planReminderMessage?: string | null;
  autoResponseMessage?: string | null;
}

export interface AutoResponseContent extends JsonLike {
  type: 'plan-reminder' | 'refusal-reminder';
  message: string;
  auto_response?: string;
}

type NonPlanObservationForLLM = Exclude<ObservationForLLM, PlanObservationForLLM>;

export type ObservationSummaryContent =
  | {
      type: 'plan-update';
      message: string;
      plan: PlanObservationForLLM['plan'];
      metadata?: ObservationMetadata;
    }
  | {
      type: 'observation';
      payload: NonPlanObservationForLLM;
      summary?: string;
      details?: string;
      metadata?: ObservationMetadata;
    };

const stringify = (value: unknown): string => JSON.stringify(value, null, JSON_INDENT);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasKeys = (value: unknown): value is JsonLike =>
  Boolean(value) && typeof value === 'object' && Object.keys(value as JsonLike).length > 0;

const PLAN_UPDATE_MESSAGE =
  'Here is the updated plan with the latest command observations.' as const;

const isPlanObservation = (
  payload: ObservationForLLM | null | undefined,
): payload is PlanObservationForLLM =>
  Boolean(payload) && Array.isArray((payload as PlanObservationForLLM).plan);

const isJsonParseErrorObservation = (
  payload: ObservationForLLM,
): payload is JsonParseErrorObservationForLLM =>
  'json_parse_error' in payload && payload.json_parse_error === true;

const isSchemaValidationErrorObservation = (
  payload: ObservationForLLM,
): payload is SchemaValidationErrorObservationForLLM =>
  'schema_validation_error' in payload && payload.schema_validation_error === true;

const isResponseValidationErrorObservation = (
  payload: ObservationForLLM,
): payload is ResponseValidationErrorObservationForLLM =>
  'response_validation_error' in payload && payload.response_validation_error === true;

const isCommandRejectedObservation = (
  payload: ObservationForLLM,
): payload is CommandRejectedObservationForLLM =>
  'canceled_by_human' in payload && payload.canceled_by_human === true;

const isOperationCanceledObservation = (
  payload: ObservationForLLM,
): payload is OperationCanceledObservationForLLM =>
  'operation_canceled' in payload && payload.operation_canceled === true;

const isCommandOutputObservation = (
  payload: ObservationForLLM,
): payload is CommandOutputObservationForLLM =>
  'stdout' in payload && 'stderr' in payload && 'truncated' in payload;

const buildObservationContent = ({
  observation,
  command,
}: ObservationInput): ObservationSummaryContent => {
  const payload = observation?.observation_for_llm ?? null;
  const metadata: ObservationMetadata = (observation?.observation_metadata ??
    {}) as ObservationMetadata;

  if (isPlanObservation(payload)) {
    const planContent: ObservationSummaryContent = {
      type: 'plan-update',
      message: PLAN_UPDATE_MESSAGE,
      plan: payload.plan,
    };

    if (hasKeys(metadata)) {
      planContent.metadata = metadata;
    }

    return planContent;
  }

  if (!payload) {
    throw new TypeError('Observation payload is required to build history content.');
  }

  const nonPlanPayload: NonPlanObservationForLLM = payload as NonPlanObservationForLLM;
  const summaryParts: string[] = [];

  if (isJsonParseErrorObservation(nonPlanPayload)) {
    summaryParts.push('I could not parse the previous assistant JSON response.');
  } else if (isSchemaValidationErrorObservation(nonPlanPayload)) {
    summaryParts.push('The previous assistant response failed schema validation.');
  } else if (isResponseValidationErrorObservation(nonPlanPayload)) {
    summaryParts.push('The previous assistant response failed protocol validation checks.');
  } else if (isCommandRejectedObservation(nonPlanPayload)) {
    summaryParts.push('A human reviewer declined the proposed command.');
  } else if (isOperationCanceledObservation(nonPlanPayload)) {
    summaryParts.push('The operation was canceled before completion.');
  } else {
    if (command && typeof command === 'object') {
      summaryParts.push('I executed the approved command from the active plan.');
    } else {
      summaryParts.push('I have an update from the last command execution.');
    }

    if (
      isCommandOutputObservation(nonPlanPayload) &&
      typeof nonPlanPayload.exit_code === 'number'
    ) {
      summaryParts.push(`It finished with exit code ${nonPlanPayload.exit_code}.`);
    }

    if (isCommandOutputObservation(nonPlanPayload)) {
      if (nonPlanPayload.truncated) {
        summaryParts.push(
          nonPlanPayload.truncation_notice
            ? String(nonPlanPayload.truncation_notice)
            : 'Note: the output shown below is truncated.',
        );
      } else if (nonPlanPayload.truncation_notice) {
        summaryParts.push(String(nonPlanPayload.truncation_notice));
      }
    }
  }

  const content: ObservationSummaryContent = {
    type: 'observation',
    payload: nonPlanPayload,
  };

  if (summaryParts.length > 0) {
    content.summary = summaryParts.join(' ');
  }

  if ('message' in nonPlanPayload) {
    if (
      isJsonParseErrorObservation(nonPlanPayload) ||
      isSchemaValidationErrorObservation(nonPlanPayload) ||
      isResponseValidationErrorObservation(nonPlanPayload) ||
      isCommandRejectedObservation(nonPlanPayload) ||
      isOperationCanceledObservation(nonPlanPayload)
    ) {
      content.details = String(nonPlanPayload.message);
    }
  }

  if (hasKeys(metadata)) {
    content.metadata = metadata;
  }

  return content;
};

export const formatObservationMessage = ({
  observation,
  command = null,
}: ObservationInput): ObservationSummaryContent =>
  buildObservationContent({ observation, command });

export const createObservationHistoryEntry = ({
  observation,
  command = null,
  pass,
}: ObservationHistoryEntryInput) =>
  createChatMessageEntry({
    eventType: 'chat-message',
    role: 'user',
    pass,
    content: stringify(buildObservationContent({ observation, command })),
  });

export const createPlanReminderEntry = ({ planReminderMessage, pass }: AutoResponseInput) => {
  const content: AutoResponseContent = {
    type: 'plan-reminder',
    message:
      'I still have unfinished steps in the active plan. I am reminding myself to keep working on them.',
  };

  if (isNonEmptyString(planReminderMessage)) {
    content.auto_response = planReminderMessage.trim();
  }

  return createChatMessageEntry({
    eventType: 'chat-message',
    role: 'assistant',
    pass,
    content: stringify(content),
  });
};

export const createRefusalAutoResponseEntry = ({
  autoResponseMessage,
  pass,
}: AutoResponseInput) => {
  const content: AutoResponseContent = {
    type: 'refusal-reminder',
    message: 'The previous response appeared to be a refusal, so I nudged myself to continue.',
  };

  if (isNonEmptyString(autoResponseMessage)) {
    content.auto_response = autoResponseMessage.trim();
  }

  return createChatMessageEntry({
    eventType: 'chat-message',
    role: 'assistant',
    pass,
    content: stringify(content),
  });
};

export default {
  formatObservationMessage,
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
};
