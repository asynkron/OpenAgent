interface ToolCallCandidate {
  type?: string;
  name?: string;
  arguments?: unknown;
  call_id?: unknown;
}

interface OutputTextPart {
  type?: string;
  text?: string;
}

interface MessageCandidate {
  type?: string;
  content?: OutputTextPart[];
}

interface ModelResponseLike {
  output?: Array<ToolCallCandidate | MessageCandidate | null | undefined>;
  output_text?: string;
}

export interface OpenAgentToolCall {
  name: 'open-agent';
  call_id: string | null;
  arguments: string;
}

const OPEN_AGENT_TOOL_NAME = 'open-agent';

const normalizeArguments = (args: unknown): string => {
  if (typeof args === 'string') {
    return args.trim();
  }

  if (args && typeof args === 'object') {
    try {
      return JSON.stringify(args);
    } catch (_error) {
      return '';
    }
  }

  return '';
};

const isToolCallCandidate = (item: unknown): item is ToolCallCandidate => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as ToolCallCandidate;
  return candidate.type === 'function_call' && candidate.name === OPEN_AGENT_TOOL_NAME;
};

const toOpenAgentToolCall = (candidate: ToolCallCandidate): OpenAgentToolCall => ({
  name: OPEN_AGENT_TOOL_NAME,
  call_id: typeof candidate.call_id === 'string' ? candidate.call_id : null,
  arguments: normalizeArguments(candidate.arguments),
});

export const extractOpenAgentToolCall = (
  response: ModelResponseLike | null | undefined,
): OpenAgentToolCall | null => {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (isToolCallCandidate(item)) {
      return toOpenAgentToolCall(item);
    }
  }

  return null;
};

const extractFromOutputMessages = (response: ModelResponseLike): string => {
  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const messageCandidate = item as MessageCandidate;
    if (messageCandidate.type !== 'message' || !Array.isArray(messageCandidate.content)) {
      continue;
    }

    for (const part of messageCandidate.content) {
      if (part && part.type === 'output_text' && typeof part.text === 'string') {
        const normalized = part.text.trim();
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return '';
};

export const extractResponseText = (response: ModelResponseLike | null | undefined): string => {
  const toolCall = extractOpenAgentToolCall(response);
  if (toolCall && toolCall.arguments) {
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

  return extractFromOutputMessages(response);
};

export default {
  extractOpenAgentToolCall,
  extractResponseText,
};
