import type { LanguageModel } from 'ai';

export type ResponsesProvider = (model: string) => LanguageModel;

export type ResponsesClient = { responses: ResponsesProvider } | ResponsesFunction;

type ResponsesFunction = ResponsesProvider & {
  responses?: ResponsesProvider;
};

export function resolveResponsesModel(
  openaiProvider: ResponsesClient | undefined,
  model: string,
): LanguageModel | null {
  if (!openaiProvider) {
    return null;
  }

  if (typeof openaiProvider === 'function') {
    if (typeof openaiProvider.responses === 'function') {
      return openaiProvider.responses(model);
    }

    return openaiProvider(model);
  }

  if (typeof openaiProvider === 'object' && typeof openaiProvider.responses === 'function') {
    return openaiProvider.responses(model);
  }

  return null;
}

export function requireResponsesModel(
  openaiProvider: ResponsesClient | undefined,
  model: string,
): LanguageModel {
  const languageModel = resolveResponsesModel(openaiProvider, model);
  if (!languageModel) {
    throw new Error('Invalid OpenAI client instance provided.');
  }
  return languageModel;
}
