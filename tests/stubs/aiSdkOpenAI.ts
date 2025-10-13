// Lightweight stub of `@ai-sdk/openai` used during Jest runs.
// Mirrors the provider shape returned by the real SDK closely enough for unit tests.
export function createOpenAI() {
  const provider = (model: string) => ({
    __model: model,
    kind: 'direct-call',
    provider: 'stub.direct',
    modelId: model,
    specificationVersion: 'v2',
    supportedUrls: Promise.resolve([]),
  });

  provider.responses = (model: string) => ({
    __model: model,
    kind: 'responses',
    provider: 'stub.responses',
    modelId: model,
    specificationVersion: 'v2',
    supportedUrls: Promise.resolve([]),
  });
  provider.languageModel = provider;
  provider.chat = provider;

  return provider;
}
