export interface LimitedListResult<T> {
  next: T[];
  trimmed: boolean;
}

export function appendWithLimit<T>(
  list: ReadonlyArray<T>,
  entry: T,
  limit?: number,
): LimitedListResult<T> {
  const next = [...list, entry];
  if (!limit || next.length <= limit) {
    return { next, trimmed: false };
  }
  return { next: next.slice(next.length - limit), trimmed: true };
}

export function formatDebugPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload);
  }
}

export function summarizeAutoResponseDebug(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as { stage?: unknown; message?: unknown };
  const stage = typeof value.stage === 'string' ? value.stage : '';
  if (!stage) {
    return null;
  }

  if (stage === 'assistant-response-schema-validation-error') {
    const message =
      typeof value.message === 'string' && value.message.trim().length > 0
        ? value.message.trim()
        : 'Assistant response failed schema validation.';
    return `Auto-response triggered: ${message}`;
  }

  if (stage === 'assistant-response-validation-error') {
    const message =
      typeof value.message === 'string' && value.message.trim().length > 0
        ? value.message.trim()
        : 'Assistant response failed protocol validation.';
    return `Auto-response triggered: ${message}`;
  }

  return null;
}
