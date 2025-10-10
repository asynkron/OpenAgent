function normalizeArguments(args) {
  if (typeof args === 'string') {
    return args.trim();
  }

  if (args && typeof args === 'object') {
    try {
      return JSON.stringify(args);
    } catch (error) {
      return '';
    }
  }

  return '';
}

export function extractOpenAgentToolCall(response) {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if (item.type === 'function_call' && item.name === 'open-agent') {
      const normalizedArguments = normalizeArguments(item.arguments);
      return {
        name: 'open-agent',
        call_id: typeof item.call_id === 'string' ? item.call_id : null,
        arguments: normalizedArguments,
      };
    }
  }

  return null;
}

export function extractResponseText(response) {
  const toolCall = extractOpenAgentToolCall(response);
  if (toolCall && typeof toolCall.arguments === 'string' && toolCall.arguments) {
    return toolCall.arguments;
  }

  if (!response || typeof response !== 'object') {
    return '';
  }

  if (typeof response.output_text === 'string') {
    const normalized = response.output_text.trim();
    if (normalized) {
      return normalized;
    }
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if (item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (part && part.type === 'output_text' && typeof part.text === 'string') {
        const normalized = part.text.trim();
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return '';
}

export default {
  extractOpenAgentToolCall,
  extractResponseText,
};
