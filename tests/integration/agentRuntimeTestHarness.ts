import fs from 'node:fs';
import path from 'node:path';

import { jest } from '@jest/globals';
import {
  mergePlanTrees,
  clonePlanTree,
  computePlanProgress,
} from '../../packages/core/dist/src/utils/plan.js';

// Central queue used by integration suites to feed deterministic model completions
// without reaching out to the real OpenAI SDK.
const modelCompletionQueue = [];

let mockCallCounter = 0;

const planFilePath = path.resolve(process.cwd(), '.openagent/plan.json');

function clearPlanSnapshot() {
  try {
    fs.mkdirSync(path.dirname(planFilePath), { recursive: true });
    fs.writeFileSync(planFilePath, '[]\n', 'utf8');
  } catch (_error) {
    // If the snapshot cannot be cleared we swallow the error so tests keep running;
    // lingering plan state will surface through failing assertions.
  }
}

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
  clearPlanSnapshot();
}

export function createTestPlanManager(config = {}) {
  const { emit = () => {} } = config;
  let activePlan = [];
  let lastProgressSignature = null;

  const clone = (plan) => clonePlanTree(plan);

  const emitPlanProgressEvent = (plan) => {
    const progress = computePlanProgress(plan);
    const signature =
      progress.totalSteps === 0 ? null : `${progress.completedSteps}|${progress.totalSteps}`;

    if (signature === lastProgressSignature) {
      return progress;
    }

    if (signature === null) {
      lastProgressSignature = null;
      return progress;
    }

    lastProgressSignature = signature;
    emit({ type: 'plan-progress', progress });
    return progress;
  };

  return {
    isMergingEnabled() {
      return true;
    },
    get() {
      return clone(activePlan);
    },
    async update(nextPlan) {
      if (!Array.isArray(nextPlan) || nextPlan.length === 0) {
        activePlan = [];
      } else if (activePlan.length > 0) {
        activePlan = mergePlanTrees(activePlan, nextPlan);
      } else {
        activePlan = clone(nextPlan);
      }

      emitPlanProgressEvent(activePlan);
      return clone(activePlan);
    },
    async sync(nextPlan) {
      if (!Array.isArray(nextPlan)) {
        activePlan = [];
      } else {
        activePlan = clone(nextPlan);
      }

      emitPlanProgressEvent(activePlan);
      return clone(activePlan);
    },
    async initialize() {
      emitPlanProgressEvent(activePlan);
      return clone(activePlan);
    },
    async reset() {
      if (activePlan.length === 0) {
        emitPlanProgressEvent(activePlan);
        return clone(activePlan);
      }

      activePlan = [];
      emitPlanProgressEvent(activePlan);
      return clone(activePlan);
    },
  };
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

  jest.unstable_mockModule('../../packages/core/dist/src/agent/openaiRequest.js', () => ({
    requestModelCompletion: requestModelCompletionMock,
  }));

  jest.unstable_mockModule('../../packages/core/dist/src/services/commandStatsService.js', () => ({
    incrementCommandCount: commandStatsMock,
  }));

  jest.unstable_mockModule('dotenv/config', () => ({}));

  const agentModule = await import('../../index.js');

  return {
    agent: agentModule.default,
    createTestPlanManager,
    mocks: {
      requestModelCompletion: requestModelCompletionMock,
      incrementCommandCount: commandStatsMock,
    },
  };
}
