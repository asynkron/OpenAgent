import { jest } from '@jest/globals';

// Central queue used by integration suites to feed deterministic model completions
// without reaching out to the real OpenAI SDK.
const modelCompletionQueue = [];

let mockCallCounter = 0;

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

function buildCompletionFromPayload(payload) {
  mockCallCounter += 1;
  const normalized = sanitizePayload(payload);
  return {
    output: [
      {
        type: 'function_call',
        name: 'open-agent',
        call_id: `integration-call-${mockCallCounter}`,
        arguments: JSON.stringify(normalized),
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
  mockCallCounter = 0;
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

  jest.unstable_mockModule('../../packages/core/src/agent/openaiRequest.js', () => ({
    requestModelCompletion: requestModelCompletionMock,
  }));

  jest.unstable_mockModule('../../packages/core/src/services/commandStatsService.js', () => ({
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
