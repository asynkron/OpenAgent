const DEFAULT_EVENT_TYPE = 'chat-message';

const buildPayload = ({ role, content }) => {
  const payload = {};

  if (typeof role !== 'undefined') {
    payload.role = role;
  }

  if (typeof content !== 'undefined') {
    payload.content = content;
  }

  return payload;
};

export function createChatMessageEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('Chat history entry must be an object.');
  }

  const { eventType, payload: providedPayload, ...rest } = entry;
  const normalizedEventType =
    typeof eventType === 'string' && eventType.trim() ? eventType : DEFAULT_EVENT_TYPE;

  const role =
    rest.role ??
    (providedPayload && typeof providedPayload.role === 'string'
      ? providedPayload.role
      : undefined);
  const hasContent = Object.prototype.hasOwnProperty.call(rest, 'content');
  const content = hasContent
    ? rest.content
    : providedPayload && Object.prototype.hasOwnProperty.call(providedPayload, 'content')
      ? providedPayload.content
      : undefined;

  return {
    eventType: normalizedEventType,
    ...rest,
    payload: buildPayload({ role, content }),
  };
}

export function mapHistoryToOpenAIMessages(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
      const role =
        payload && typeof payload.role === 'string'
          ? payload.role
          : typeof entry.role === 'string'
            ? entry.role
            : null;

      if (!role) {
        return null;
      }

      const message = { role };

      if (payload && Object.prototype.hasOwnProperty.call(payload, 'content')) {
        message.content = payload.content;
      } else if (Object.prototype.hasOwnProperty.call(entry, 'content')) {
        message.content = entry.content;
      } else {
        message.content = '';
      }

      return message;
    })
    .filter(Boolean);
}

export default {
  createChatMessageEntry,
  mapHistoryToOpenAIMessages,
};
