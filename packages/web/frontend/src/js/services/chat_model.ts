/**
 * Shared agent chat message helpers. These utilities stay free of DOM access so
 * we can unit test them directly while keeping the main chat service focused on
 * wiring UI events.
 */
import type { PlanStep } from '../components/plan_model.js';

export type AgentRole = 'agent' | 'user';

export interface AgentMetadata {
  scope?: string;
  [key: string]: unknown;
}

export interface CommandPreview {
  code?: string;
  language?: string;
  classNames?: string[] | string;
}

export interface AgentCommand {
  run?: string;
  description?: string;
  shell?: string;
  preview?: CommandPreview | null;
  workingDirectory?: string;
}

export interface AgentEventPayload {
  eventType?: string;
  text?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  details?: string;
  level?: string;
  prompt?: string;
  metadata?: AgentMetadata | null;
}

export interface AgentCommandPayload extends AgentEventPayload {
  command?: AgentCommand | null;
}

export interface AgentMessagePayload extends AgentEventPayload {
  state?: string;
  prompt?: string;
  plan?: PlanStep[] | null;
  message?: string;
}

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

export function isApprovalNotification(payload: AgentEventPayload | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

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

  return fields.some((value) => isApprovalText(value));
}

export function normaliseClassList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return [];
}

export interface NormalisedPreview {
  code: string;
  language: string;
  classNames: string[];
}

export function normalisePreview(preview: CommandPreview | null | undefined): NormalisedPreview {
  if (!preview || typeof preview !== 'object') {
    return { code: '', language: '', classNames: [] };
  }

  const code = typeof preview.code === 'string' ? preview.code : '';
  const language = typeof preview.language === 'string' ? preview.language : '';
  const classNames = normaliseClassList(preview.classNames ?? []);
  return { code, language, classNames };
}
