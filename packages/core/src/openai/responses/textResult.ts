import { generateText, type LanguageModel, type ModelMessage, type ToolSet, type GenerateTextResult } from 'ai';

import type { ProviderOptions, ResponseCallSettings } from './callSettings.js';

interface ResponseMessageContent {
  type: 'output_text';
  text: string;
}

interface ResponseMessage {
  type: 'message';
  role: 'assistant';
  content: ResponseMessageContent[];
}

export interface TextResponseResult {
  output_text: string;
  output: ResponseMessage[];
  text: GenerateTextResult<ToolSet, string>;
}

export async function createTextResult(
  languageModel: LanguageModel,
  messages: ModelMessage[],
  providerOptions: ProviderOptions,
  callSettings: ResponseCallSettings,
): Promise<TextResponseResult> {
  const textResult = await generateText({
    model: languageModel,
    messages,
    providerOptions,
    ...callSettings,
  });

  const normalizedText = typeof textResult.text === 'string' ? textResult.text : '';

  return {
    output_text: normalizedText,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: normalizedText,
          },
        ],
      },
    ],
    text: textResult,
  };
}
