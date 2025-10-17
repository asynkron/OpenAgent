import type { PlanObservation } from './plan.js';

export interface ChatMessageContentPart {
  type: 'text';
  text?: string;
  value?: string;
}

export type ChatMessageContent = string | ChatMessageContentPart[];

export interface ChatMessagePayload {
  role?: string;
  content?: ChatMessageContent;
  observation?: PlanObservation | null;
}

export interface ChatMessageEntry {
  eventType: string;
  payload: ChatMessagePayload;
  role?: string;
  content?: ChatMessageContent;
  pass?: number;
  summary?: string;
  details?: string;
  id?: string;
  name?: string;
}
