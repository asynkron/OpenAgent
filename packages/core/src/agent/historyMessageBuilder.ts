// @ts-nocheck
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

export interface ObservationForLLM extends JsonLike {
  plan?: unknown[];
  json_parse_error?: boolean;
  schema_validation_error?: boolean;
  response_validation_error?: boolean;
  canceled_by_human?: boolean;
  operation_canceled?: boolean;
  exit_code?: number;
  truncated?: boolean;
  truncation_notice?: string;
  message?: string;
}

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

export type ObservationSummaryContent =
  | {
      type: 'plan-update';
      message: string;
      plan: unknown[];
      metadata?: ObservationMetadata;
    }
  | {
      type: 'observation';
      payload: ObservationForLLM;
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

const buildObservationContent = ({
  observation,
  command,
}: ObservationInput): ObservationSummaryContent => {
  const payload: ObservationForLLM = (observation?.observation_for_llm ?? {}) as ObservationForLLM;
  const metadata: ObservationMetadata = (observation?.observation_metadata ??
    {}) as ObservationMetadata;

  if (Array.isArray(payload.plan)) {
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

  const summaryParts: string[] = [];

  if (payload.json_parse_error) {
    summaryParts.push('I could not parse the previous assistant JSON response.');
  } else if (payload.schema_validation_error) {
    summaryParts.push('The previous assistant response failed schema validation.');
  } else if (payload.response_validation_error) {
    summaryParts.push('The previous assistant response failed protocol validation checks.');
  } else if (payload.canceled_by_human) {
    summaryParts.push('A human reviewer declined the proposed command.');
  } else if (payload.operation_canceled) {
    summaryParts.push('The operation was canceled before completion.');
  } else {
    if (command && typeof command === 'object') {
      summaryParts.push('I executed the approved command from the active plan.');
    } else {
      summaryParts.push('I have an update from the last command execution.');
    }

    if (typeof payload.exit_code === 'number') {
      summaryParts.push(`It finished with exit code ${payload.exit_code}.`);
    }

    if (payload.truncated) {
      summaryParts.push(
        payload.truncation_notice
          ? String(payload.truncation_notice)
          : 'Note: the output shown below is truncated.',
      );
    } else if (payload.truncation_notice) {
      summaryParts.push(String(payload.truncation_notice));
    }
  }

  const content: ObservationSummaryContent = {
    type: 'observation',
    payload,
  };

  if (summaryParts.length > 0) {
    content.summary = summaryParts.join(' ');
  }

  if (
    payload.message &&
    (payload.json_parse_error ||
      payload.schema_validation_error ||
      payload.response_validation_error ||
      payload.canceled_by_human ||
      payload.operation_canceled)
  ) {
    content.details = String(payload.message);
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
