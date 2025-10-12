// Placeholder for the official `openai` SDK so Jest can resolve the module.
export default class OpenAIStub {
  constructor() {
    throw new Error('OpenAI stub instantiated without a test mock.');
  }
}

export const OpenAI = OpenAIStub;
