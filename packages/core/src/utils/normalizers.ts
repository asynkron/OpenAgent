import type { PlanResponse, PlanStep } from '../contracts/plan.js';
import type { NormalizedPlanResponse, NormalizedPlanStep, ChatContentNormalized } from '../contracts/internalNormalized.js';
import type { ChatMessageContent } from '../contracts/history.js';

export function normalizePlan(value: PlanResponse): NormalizedPlanResponse {
  const steps: NormalizedPlanStep[] = value.plan.map((s: PlanStep) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    waitingForId: Array.isArray(s.waitingForId) ? s.waitingForId : [],
    command: s.command,
    observation: s.observation ?? null,
  }));
  return { message: value.message, plan: steps };
}

export function normalizeChatContent(input: ChatMessageContent): ChatContentNormalized {
  if (typeof input === 'string') {
    return { parts: [{ type: 'text', text: input }] } as ChatContentNormalized;
  }
  const parts = [] as { type: 'text'; text: string }[];
  for (const p of input) {
    if (!p || p.type !== 'text') continue;
    const text: string = typeof p.text === 'string' ? p.text : '';
    parts.push({ type: 'text', text });
  }
  return { parts } as ChatContentNormalized;
}
