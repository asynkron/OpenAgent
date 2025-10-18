import type { GenerateObjectResult, GenerateTextResult, ToolSet } from 'ai';

import type { PlanResponse } from './plan.js';

export type AiResponseFunctionCall = {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string | null;
};
export type AiResponseMessageContent = { type: 'output_text'; text: string };
export type AiResponseMessage = {
  type: 'message';
  role: 'assistant';
  content: AiResponseMessageContent[];
};
export type AiResponseOutput = AiResponseFunctionCall | AiResponseMessage;
export type StructuredModelResponse = {
  output_text: string;
  output: AiResponseOutput[];
  structured: GenerateObjectResult<PlanResponse>;
};
export type TextModelResponse = {
  output_text: string;
  output: AiResponseOutput[];
  text: GenerateTextResult<ToolSet, string>;
};
