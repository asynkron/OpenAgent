import { describe, expect, jest, test } from '@jest/globals';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const TEST_MODEL = process.env.OPENAI_TEST_MODEL ?? 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  describe.skip('OpenAI real call integration', () => {
    test('requires OPENAI_API_KEY', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('OpenAI real call integration', () => {
    jest.setTimeout(60000);

    test('requestModelCompletion succeeds against OpenAI', async () => {
      const { requestModelCompletion } = await import('../../packages/core/src/agent/modelRequest.ts');
      const { getOpenAIClient } = await import('../../packages/core/src/openai/client.ts');
      const { createChatMessageEntry } = await import('../../packages/core/src/agent/historyEntry.ts');
      const { ObservationBuilder } = await import('../../packages/core/src/agent/observationBuilder.ts');

      const observationBuilder = new ObservationBuilder({
        combineStdStreams: (stdout: string, stderr: string, _exitCode: number | null | undefined) => ({
          stdout,
          stderr,
        }),
        applyFilter: (text: string) => text,
        tailLines: (text: string) => text,
        buildPreview: (text: string) => text,
      });

      const history = [createChatMessageEntry({ role: 'user', content: 'Respond with the word "hello".' })];

      const openai = getOpenAIClient();

      const result = await requestModelCompletion({
        openai,
        model: TEST_MODEL,
        history,
        observationBuilder,
        escState: null,
        startThinkingFn: () => {},
        stopThinkingFn: () => {},
        passIndex: 0,
      });

      expect(result.status).toBe('success');
      expect(result.completion).toBeTruthy();
    });
  });
}
