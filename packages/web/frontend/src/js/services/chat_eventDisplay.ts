import {
  isApprovalNotification,
  isApprovalText,
  normalisePreview,
  type AgentEventPayload,
} from './chat_model.js';
import {
  normaliseEventFields,
  normaliseField,
  resolveBannerDisplay,
  resolveDefaultDisplay,
  resolveStatusDisplay,
  type NormalisedEventFields,
  type ResolvedDisplay,
} from './chat_eventDisplayHelpers.js';

type EventDisplayResolver = (fields: NormalisedEventFields) => ResolvedDisplay | null;

const AGENT_EVENT_RESOLVERS: Record<string, EventDisplayResolver> = {
  banner: resolveBannerDisplay,
  status: resolveStatusDisplay,
  'request-input': () => null,
};

const defaultEventDisplayResolver: EventDisplayResolver = resolveDefaultDisplay;

export interface EventDisplayResult {
  display: ResolvedDisplay;
  level: string;
  scope: string;
}

export const resolveAgentEventDisplay = (
  eventType: string,
  payload: AgentEventPayload = {},
): EventDisplayResult | null => {
  if (isApprovalNotification(payload)) {
    return null;
  }

  const fields = normaliseEventFields(payload);
  const resolver = AGENT_EVENT_RESOLVERS[eventType] ?? defaultEventDisplayResolver;
  const result = resolver(fields);

  if (!result) {
    return null;
  }

  return {
    display: result,
    level: payload.level ? normaliseField(payload.level) : '',
    scope: fields.scope,
  };
};

export const resolveCommandPreview = (
  preview: Parameters<typeof normalisePreview>[0],
): ReturnType<typeof normalisePreview> => normalisePreview(preview);

export const shouldDisplayApprovalText = (content: string): boolean => !isApprovalText(content);
