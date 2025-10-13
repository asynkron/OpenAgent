import {
  isApprovalNotification,
  isApprovalText,
  normalisePreview,
  normaliseText,
  type AgentEventPayload,
} from './chat_model.js';

interface NormalisedEventFields {
  text: string;
  title: string;
  subtitle: string;
  description: string;
  details: string;
  scope: string;
}

interface ResolvedDisplay {
  header: string;
  body: string;
}

type EventDisplayResolver = (fields: NormalisedEventFields) => ResolvedDisplay | null;

const AGENT_EVENT_RESOLVERS: Record<string, EventDisplayResolver> = {
  banner(fields) {
    const fallback = fields.subtitle || fields.description || fields.details || '';
    const header = fields.title || fields.text || 'Agent banner';
    const body = fallback || (fields.text && fields.text !== header ? fields.text : '');
    return resolveOrFallback(header, body, fields);
  },
  status(fields) {
    const fallback = fields.subtitle || fields.description || fields.details || fields.text || '';
    const header = fields.title || 'Status update';
    return resolveOrFallback(header, fallback, fields);
  },
  'request-input': () => null,
};

const resolveOrFallback = (
  header: string,
  body: string,
  fields: NormalisedEventFields,
): ResolvedDisplay | null => {
  const resolvedHeader = header;
  let resolvedBody = body;

  if (!resolvedHeader && !resolvedBody && fields.text) {
    resolvedBody = fields.text;
  }

  if (!resolvedHeader && !resolvedBody) {
    return null;
  }

  return { header: resolvedHeader, body: resolvedBody };
};

const defaultEventDisplayResolver: EventDisplayResolver = (fields) => {
  const fallback = fields.subtitle || fields.description || fields.details || '';
  const header = fields.title || fields.text;
  return resolveOrFallback(header, fallback || fields.text || '', fields);
};

const normaliseEventFields = (payload: AgentEventPayload = {}): NormalisedEventFields => ({
  text: normaliseText(payload.text).trim(),
  title: normaliseText(payload.title).trim(),
  subtitle: normaliseText(payload.subtitle).trim(),
  description: normaliseText(payload.description).trim(),
  details: normaliseText(payload.details).trim(),
  scope: normaliseText(payload.metadata?.scope).trim(),
});

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
    level: payload.level ? normaliseText(payload.level).trim() : '',
    scope: fields.scope,
  };
};

export const resolveCommandPreview = (
  preview: Parameters<typeof normalisePreview>[0],
): ReturnType<typeof normalisePreview> => normalisePreview(preview);

export const shouldDisplayApprovalText = (content: string): boolean => !isApprovalText(content);
