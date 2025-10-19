import type { PlanStatus } from './planStatus.js';
import type { PlanObservation, PlanResponse, PlanStep } from './plan.js';
import type { ChatMessageContent } from './history.js';

export interface NormalizedPlanStep {
  id: string;
  title: string;
  status: PlanStatus;
  waitingForId: string[];
  command: PlanStep['command'];
  observation: PlanObservation | null;
}

export interface NormalizedPlanResponse {
  message: string;
  plan: NormalizedPlanStep[];
}

export interface ChatTextPart { type: 'text'; text: string }
export interface ChatContentNormalized { parts: ChatTextPart[] }

export type { PlanResponse, PlanStep, ChatMessageContent };
