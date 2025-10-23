import {
  isApprovalNotification,
  normaliseText,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
  type AgentRole,
} from './chat_model.js';
import { shouldAppendStatusMessage } from './chat_domController.js';

import type { PlanStep } from '../components/plan_display.js';

function normaliseEventId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

const AGENT_PAYLOAD_TYPES = [
  'agent_message',
  'agent_status',
  'agent_error',
  'agent_thinking',
  'agent_request_input',
  'agent_plan',
  'agent_event',
  'agent_command',
] as const;

export type AgentPayloadType = (typeof AGENT_PAYLOAD_TYPES)[number];

export type AgentIncomingPayload =
  | (AgentMessagePayload & { type: 'agent_message' })
  | (AgentMessagePayload & { type: 'agent_status' })
  | (AgentMessagePayload & { type: 'agent_error' })
  | (AgentMessagePayload & { type: 'agent_thinking'; state?: 'start' | 'stop' })
  | (AgentMessagePayload & { type: 'agent_request_input' })
  | (AgentMessagePayload & { type: 'agent_plan' })
  | (AgentEventPayload & { type: 'agent_event' })
  | (AgentCommandPayload & { type: 'agent_command' });

const AGENT_PAYLOAD_TYPE_SET = new Set<string>(AGENT_PAYLOAD_TYPES);

export function parseAgentPayload(data: unknown): AgentIncomingPayload | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as { type?: unknown };
  if (typeof payload.type !== 'string' || !AGENT_PAYLOAD_TYPE_SET.has(payload.type)) {
    return null;
  }

  return payload as AgentIncomingPayload;
}

export interface ChatMessageAction {
  type: 'message';
  role: AgentRole;
  text: string;
  startConversation?: boolean;
  eventId?: string;
  final?: boolean;
}

export interface ChatStatusAction {
  type: 'status';
  message: string;
  level?: string;
  clear?: boolean;
}

export interface ChatPlanAction {
  type: 'plan';
  steps: PlanStep[];
  startConversation?: boolean;
}

export interface ChatEventAction {
  type: 'event';
  eventType: string;
  payload: AgentEventPayload;
  startConversation?: boolean;
}

export interface ChatCommandAction {
  type: 'command';
  payload: AgentCommandPayload;
  startConversation?: boolean;
  eventId?: string;
}

export interface ChatThinkingAction {
  type: 'thinking';
  active: boolean;
}

export type ChatRouteAction =
  | ChatMessageAction
  | ChatStatusAction
  | ChatPlanAction
  | ChatEventAction
  | ChatCommandAction
  | ChatThinkingAction;

export interface ChatRouter {
  onMessage(payload: AgentIncomingPayload & { type: 'agent_message' }): ChatRouteAction[];
  onStatus(payload: AgentIncomingPayload & { type: 'agent_status' }): ChatRouteAction[];
  onError(payload: AgentIncomingPayload & { type: 'agent_error' }): ChatRouteAction[];
  onThinking(payload: AgentIncomingPayload & { type: 'agent_thinking' }): ChatRouteAction[];
  onRequestInput(
    payload: AgentIncomingPayload & { type: 'agent_request_input' },
  ): ChatRouteAction[];
  onPlan(payload: AgentIncomingPayload & { type: 'agent_plan' }): ChatRouteAction[];
  onEvent(payload: AgentIncomingPayload & { type: 'agent_event' }): ChatRouteAction[];
  onCommand(payload: AgentIncomingPayload & { type: 'agent_command' }): ChatRouteAction[];
  route(payload: AgentIncomingPayload): ChatRouteAction[];
}

function ensureArray(
  actions: ChatRouteAction | ChatRouteAction[] | null | undefined,
): ChatRouteAction[] {
  if (!actions) {
    return [];
  }
  return Array.isArray(actions) ? actions : [actions];
}

export function createChatRouter(): ChatRouter {
  const onMessage: ChatRouter['onMessage'] = (payload) => {
    const text = normaliseText(payload.text);
    const eventId = normaliseEventId(payload.__id);
    const state = typeof payload.state === 'string' ? payload.state.trim().toLowerCase() : '';
    const isFinal = state === 'final';
    if (!text) {
      return [{ type: 'thinking', active: false }];
    }
    return [
      { type: 'thinking', active: false },
      {
        type: 'message',
        role: 'agent',
        text,
        startConversation: true,
        ...(eventId ? { eventId } : {}),
        ...(isFinal ? { final: true } : {}),
      },
    ];
  };

  const onStatus: ChatRouter['onStatus'] = (payload) => {
    const text = normaliseText(payload.text);
    if (isApprovalNotification({ ...payload, text } as AgentMessagePayload)) {
      return [{ type: 'thinking', active: false }];
    }
    if (!text) {
      return [{ type: 'thinking', active: false }];
    }
    return [
      { type: 'thinking', active: false },
      { type: 'status', message: text, level: payload.level },
    ];
  };

  const onError: ChatRouter['onError'] = (payload) => {
    const message = normaliseText(payload.message);
    const actions: ChatRouteAction[] = [{ type: 'thinking', active: false }];
    if (message) {
      actions.push({ type: 'status', message, level: 'error' });
      actions.push({
        type: 'message',
        role: 'agent',
        text: message,
        startConversation: true,
      });
    }

    const details = normaliseText(payload.details).trim();
    if (details && details !== message) {
      actions.push({
        type: 'message',
        role: 'agent',
        text: details,
        startConversation: true,
      });
    }

    return actions;
  };

  const onThinking: ChatRouter['onThinking'] = (payload) => [
    { type: 'thinking', active: payload.state === 'start' },
  ];

  const onRequestInput: ChatRouter['onRequestInput'] = (payload) => {
    const promptText = normaliseText(payload.prompt).trim();
    if (!promptText || promptText === '▷' || !shouldAppendStatusMessage(payload)) {
      return [
        { type: 'thinking', active: false },
        { type: 'status', message: '', clear: true },
      ];
    }

    const scope =
      typeof payload.metadata?.scope === 'string'
        ? payload.metadata.scope.trim().toLowerCase()
        : '';
    const isApprovalPrompt = scope === 'approval';

    return [
      { type: 'thinking', active: false },
      {
        type: 'status',
        message: promptText,
        ...(isApprovalPrompt ? { level: 'warn' } : {}),
      },
    ];
  };

  const onPlan: ChatRouter['onPlan'] = (payload) => {
    const planSteps: PlanStep[] = Array.isArray(payload.plan) ? (payload.plan as PlanStep[]) : [];
    return [{ type: 'plan', steps: planSteps, startConversation: true }];
  };

  const onEvent: ChatRouter['onEvent'] = (payload) => {
    const eventType = payload.eventType ?? 'event';
    return [
      {
        type: 'event',
        eventType,
        payload,
        startConversation: true,
      },
    ];
  };

  const onCommand: ChatRouter['onCommand'] = (payload) => {
    const eventId = normaliseEventId(payload.__id);
    return [
      { type: 'thinking', active: false },
      {
        type: 'command',
        payload,
        startConversation: true,
        ...(eventId ? { eventId } : {}),
      },
    ];
  };

  const handlers: {
    [Type in AgentPayloadType]: (
      payload: Extract<AgentIncomingPayload, { type: Type }>,
    ) => ChatRouteAction | ChatRouteAction[] | null;
  } = {
    agent_message: onMessage,
    agent_status: onStatus,
    agent_error: onError,
    agent_thinking: onThinking,
    agent_request_input: onRequestInput,
    agent_plan: onPlan,
    agent_event: onEvent,
    agent_command: onCommand,
  };

  const route: ChatRouter['route'] = (payload) => {
    const handler = handlers[payload.type] as (
      value: AgentIncomingPayload,
    ) => ChatRouteAction | ChatRouteAction[] | null;
    return ensureArray(handler(payload));
  };

  return {
    onMessage,
    onStatus,
    onError,
    onThinking,
    onRequestInput,
    onPlan,
    onEvent,
    onCommand,
    route,
  };
}
