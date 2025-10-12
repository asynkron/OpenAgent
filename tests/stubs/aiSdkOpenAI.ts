// Lightweight stub of `@ai-sdk/openai` used during Jest runs.
// The production runtime uses the real SDK, but tests only need a predictable surface.
export function createOpenAI() {
  return {
    responses(model: string) {
      return { __model: model };
    },
  };
}
