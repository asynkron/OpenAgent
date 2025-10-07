import { jest } from '@jest/globals';

// Central queue used by integration suites to feed deterministic model completions
// without reaching out to the real OpenAI SDK.
const modelCompletionQueue = [];

function buildCompletionFromPayload(payload) {
  return {
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(payload),
          },
        ],
      },
    ],
  };
}

export function queueModelResponse(payload) {
  modelCompletionQueue.push({ status: 'success', completion: buildCompletionFromPayload(payload) });
}

export function queueModelCompletion(outcome) {
  modelCompletionQueue.push(outcome);
}

export function resetQueuedResponses() {
  modelCompletionQueue.length = 0;
}

export async function loadAgentWithMockedModules() {
  jest.resetModules();
  resetQueuedResponses();

  const commandStatsMock = jest.fn().mockResolvedValue(true);
  const requestModelCompletionMock = jest.fn().mockImplementation(async () => {
    if (modelCompletionQueue.length === 0) {
      throw new Error('No mock model completion queued.');
    }
    return modelCompletionQueue.shift();
  });

  jest.unstable_mockModule('../../src/agent/openaiRequest.js', () => ({
    requestModelCompletion: requestModelCompletionMock,
  }));

  jest.unstable_mockModule('../../src/services/commandStatsService.js', () => ({
    incrementCommandCount: commandStatsMock,
  }));

  jest.unstable_mockModule('dotenv/config', () => ({}));

  const agentModule = await import('../../index.js');

  return {
    agent: agentModule.default,
    mocks: {
      requestModelCompletion: requestModelCompletionMock,
      incrementCommandCount: commandStatsMock,
    },
  };
}
