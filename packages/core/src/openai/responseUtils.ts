import type { CreateResponseResult, ToolCall } from '../contracts/index.js';

const OPEN_AGENT_TOOL_NAME = 'open-agent';

// Helpers --------------------------------------------------------------------

type ResponseOutput = CreateResponseResult['output'][number];
type FunctionCallOutput = Extract<ResponseOutput, { type: 'function_call' }>; // Normalized by the AI SDK
type MessageOutput = Extract<ResponseOutput, { type: 'message' }>;

const isFunctionCallOutput = (output: ResponseOutput): output is FunctionCallOutput =>
  output?.type === 'function_call';

const isAssistantMessageOutput = (output: ResponseOutput): output is MessageOutput =>
  output?.type === 'message' && output.role === 'assistant';

const normalizeText = (rawText: string | null | undefined): string =>
  typeof rawText === 'string' ? rawText.trim() : '';

const findOutputText = (message: MessageOutput): string => {
  for (const part of message.content) {
    if (!part || part.type !== 'output_text') {
      continue;
    }

    const normalized = normalizeText(part.text);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

// Public API -----------------------------------------------------------------

export function extractOpenAgentToolCall(
  response: CreateResponseResult | null | undefined,
): ToolCall | null {
  if (!response) {
    return null;
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!isFunctionCallOutput(item)) {
      continue;
    }

    if (item.name !== OPEN_AGENT_TOOL_NAME) {
      continue;
    }

    return {
      name: OPEN_AGENT_TOOL_NAME,
      call_id: typeof item.call_id === 'string' ? item.call_id : null,
      arguments: normalizeText(item.arguments),
    };
  }

  return null;
}

export function extractResponseText(response: CreateResponseResult | null | undefined): string {
  const toolCall = extractOpenAgentToolCall(response);
  if (toolCall?.arguments) {
    return toolCall.arguments;
  }

  if (!response) {
    return '';
  }

  const directText = normalizeText(response.output_text);
  if (directText) {
    return directText;
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!isAssistantMessageOutput(item)) {
      continue;
    }

    const normalized = findOutputText(item);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export default {
  extractOpenAgentToolCall,
  extractResponseText,
};
