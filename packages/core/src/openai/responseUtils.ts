type ToolCallArguments = string | Record<string, unknown> | Array<unknown> | null | undefined;

interface RawToolCall {
  type?: string;
  name?: string;
  arguments?: ToolCallArguments;
  call_id?: string | null | undefined;
}

interface RawMessagePart {
  type?: string;
  text?: string | null | undefined;
}

interface RawMessage {
  type?: string;
  content?: Array<RawMessagePart | null | undefined> | null | undefined;
}

type RawResponseOutput = RawToolCall | RawMessage | null | undefined;

export interface ModelResponseLike {
  output?: RawResponseOutput[];
  output_text?: string | null | undefined;
}

export interface OpenAgentToolCall {
  name: 'open-agent';
  call_id: string | null;
  arguments: string;
}

const OPEN_AGENT_TOOL_NAME = 'open-agent';

const normalizeArguments = (args: ToolCallArguments): string => {
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

const isToolCall = (item: RawResponseOutput): item is RawToolCall => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as RawToolCall;
  return candidate.type === 'function_call' && candidate.name === OPEN_AGENT_TOOL_NAME;
};

const isMessage = (item: RawResponseOutput): item is RawMessage => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as RawMessage;
  return candidate.type === 'message' && Array.isArray(candidate.content);
};

const toOpenAgentToolCall = (candidate: RawToolCall): OpenAgentToolCall => ({
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
    if (isToolCall(item)) {
      return toOpenAgentToolCall(item);
    }
  }

  return null;
};

const extractFromOutputMessages = (response: ModelResponseLike): string => {
  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!isMessage(item) || !Array.isArray(item.content)) {
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
