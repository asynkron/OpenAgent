// @ts-nocheck
/* eslint-env jest */
import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAgentRuntime } from '../loop.js';

let responseCounter = 0;

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

function buildResponsePayload(payload) {
  responseCounter += 1;
  const normalized = sanitizePayload(payload);
  return Promise.resolve({
    output: [
      {
        type: 'function_call',
        name: 'open-agent',
        call_id: `plan-progress-${responseCounter}`,
        arguments: JSON.stringify(normalized),
      },
    ],
  });
}

async function withIsolatedCwd(fn) {
  const tempDir = await mkdtemp(join(tmpdir(), 'openagent-plan-'));
  const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tempDir);

  try {
    return await fn();
  } finally {
    cwdSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createRuntimeWithQueue(queue, overrides = {}) {
  const responsesCreate = jest.fn(() => {
    if (queue.length === 0) {
      throw new Error('Response queue exhausted');
    }
    return queue.shift();
  });

  const defaults = {
    getClient: () => ({ responses: { create: responsesCreate } }),
    model: 'test-model',
    runCommandFn: jest.fn().mockResolvedValue({
      stdout: '',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    }),
    runApplyPatchFn: jest.fn(),
    applyFilterFn: (text) => text,
    tailLinesFn: (text) => text,
    isPreapprovedCommandFn: () => true,
    isSessionApprovedFn: () => true,
    approveForSessionFn: jest.fn(),
    preapprovedCfg: { allowlist: [] },
    getAutoApproveFlag: () => true,
    getNoHumanFlag: () => false,
    setNoHumanFlag: jest.fn(),
  };

  const runtime = createAgentRuntime({ ...defaults, ...overrides });

  async function runWithInputs(answers = ['Initial prompt', 'exit']) {
    const pendingAnswers = [...answers];
    const events = [];

    const outputProcessor = (async () => {
      for await (const event of runtime.outputs) {
        events.push(event);
        if (event.type === 'request-input') {
          runtime.submitPrompt(pendingAnswers.shift() ?? '');
        }
      }
    })();

    await runtime.start();
    await outputProcessor;

    return events;
  }

  return { runWithInputs };
}

describe('agent plan progress events', () => {
  test('does not emit plan-progress when plan is empty', async () => {
    const queue = [
      buildResponsePayload({
        message: 'No plan tasks',
        plan: [],
      }),
    ];

    const events = await withIsolatedCwd(async () => {
      const { runWithInputs } = createRuntimeWithQueue(queue);
      return runWithInputs(['Initial prompt', 'exit']);
    });

    expect(events.filter((event) => event.type === 'plan-progress')).toHaveLength(0);
  });

  test('emits plan-progress when plan contains tasks', async () => {
    const queue = [
      buildResponsePayload({
        message: 'Plan update',
        plan: [
          {
            id: 'plan-step-1',
            title: 'Task',
            status: 'completed',
            command: { shell: '/bin/bash', run: 'echo done' },
          },
        ],
      }),
    ];

    const events = await withIsolatedCwd(async () => {
      const { runWithInputs } = createRuntimeWithQueue(queue);
      return runWithInputs(['Initial prompt', 'exit']);
    });

    const progressEvents = events.filter((event) => event.type === 'plan-progress');
    expect(progressEvents.length).toBeGreaterThan(0);
    const hasCompletedSnapshot = progressEvents.some(
      (event) => event.progress?.completedSteps === 1 && event.progress?.totalSteps === 1,
    );
    expect(hasCompletedSnapshot).toBe(true);
  });
});

afterEach(() => {
  responseCounter = 0;
});
