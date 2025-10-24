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
  cwd?: string;
  workingDirectory?: string;
  timeoutSeconds?: number;
  filterRegex?: string;
  tailLines?: number;
}

export interface AgentCommandPreviewPayload {
  stdout?: string;
  stderr?: string;
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
  __id?: string | null;
  agent?: string | null;
}

export interface AgentCommandPayload extends AgentEventPayload {
  command?: AgentCommand | null;
  exitCode?: number | null;
  runtimeMs?: number;
  killed?: boolean;
  preview?: AgentCommandPreviewPayload | CommandPreview | null;
}

export interface AgentMessagePayload extends AgentEventPayload {
  state?: string;
  prompt?: string;
  plan?: PlanStep[] | null;
  message?: string;
}

export { normaliseText, toComparableText, isApprovalText, isApprovalNotification, APPROVAL_SUPPRESSION_PHRASES } from './chat_modelText.js';
export { normaliseClassList, normalisePreview, type NormalisedPreview } from './chat_modelPreview.js';
