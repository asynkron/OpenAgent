/**
 * Text normalisation and approval-detection helpers extracted from the chat model.
 * Keeping these helpers in their own module lets the DOM-facing services import
 * the same logic without pulling in command preview utilities.
 */
import type { AgentEventPayload } from './chat_model.js';

export const APPROVAL_SUPPRESSION_PHRASES = [
  'approve running this command?',
  'approved and added to session approvals.',
  'command approved for the remainder of the session.',
] as const;

export function normaliseText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return String(value);
  } catch (error) {
    console.warn('Failed to normalise agent text', error);
    return '';
  }
}

export function toComparableText(value: unknown): string {
  const normalised = normaliseText(value);
  if (!normalised) {
    return '';
  }
  return normalised.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isApprovalText(value: unknown): boolean {
  const comparable = toComparableText(value);
  if (!comparable) {
    return false;
  }
  return APPROVAL_SUPPRESSION_PHRASES.some((phrase) => comparable.includes(phrase));
}

function gatherApprovalFields(payload: AgentEventPayload): Array<unknown> {
  const fields: Array<unknown> = [
    payload.text,
    payload.title,
    payload.subtitle,
    payload.description,
    payload.details,
    payload.prompt,
  ];

  if (payload.metadata && typeof payload.metadata === 'object') {
    fields.push(payload.metadata.scope);
  }

  return fields;
}

export function isApprovalNotification(payload: AgentEventPayload | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const approvalFields = gatherApprovalFields(payload);
  return approvalFields.some((value) => isApprovalText(value));
}
