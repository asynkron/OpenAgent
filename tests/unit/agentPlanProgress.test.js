import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAgentRuntime } from '../../src/agent/loop.js';

function buildResponsePayload(payload) {
  return Promise.resolve({
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
    runBrowseFn: jest.fn(),
    runReadFn: jest.fn(),
    runApplyPatchFn: jest.fn(),
    runEscapeStringFn: jest.fn(),
    runUnescapeStringFn: jest.fn(),
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
        command: null,
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
        plan: [{ step: '1', title: 'Task', status: 'completed' }],
        command: null,
      }),
    ];

    const events = await withIsolatedCwd(async () => {
      const { runWithInputs } = createRuntimeWithQueue(queue);
      return runWithInputs(['Initial prompt', 'exit']);
    });

    const progressEvents = events.filter((event) => event.type === 'plan-progress');
    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].progress).toMatchObject({ completedSteps: 1, totalSteps: 1 });
  });
});
