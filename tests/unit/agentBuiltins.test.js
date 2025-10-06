import { jest } from '@jest/globals';

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

function createRuntimeWithQueue(queue, overrides = {}) {
  const responsesCreate = jest.fn(() => {
    if (!queue.length) {
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
    runBrowseFn: jest.fn().mockResolvedValue({
      stdout: 'browse result',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    }),
    runEditFn: jest.fn(),
    runReadFn: jest.fn().mockResolvedValue({
      stdout: 'file contents',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 1,
    }),
    runReplaceFn: jest.fn(),
    runEscapeStringFn: jest.fn(),
    runUnescapeStringFn: jest.fn(),
    applyFilterFn: (text) => text,
    tailLinesFn: (text) => text,
    isPreapprovedCommandFn: () => false,
    isSessionApprovedFn: () => false,
    approveForSessionFn: jest.fn(),
    preapprovedCfg: { allowlist: [] },
    getAutoApproveFlag: () => true,
    getNoHumanFlag: () => false,
    setNoHumanFlag: jest.fn(),
  };

  const config = { ...defaults, ...overrides };

  const runtime = createAgentRuntime(config);

  async function runWithPrompts(answers = ['Initial prompt', 'exit']) {
    const answerQueue = [...answers];
    const outputProcessor = (async () => {
      for await (const event of runtime.outputs) {
        if (event.type === 'request-input') {
          const next = answerQueue.shift() || '';
          runtime.submitPrompt(next);
        }
      }
    })();

    await runtime.start();
    await outputProcessor;
  }

  return {
    runtime,
    responsesCreate,
    runWithPrompts,
    runCommandFn: config.runCommandFn,
    runBrowseFn: config.runBrowseFn,
    runReadFn: config.runReadFn,
  };
}

describe('agent built-in command parsing', () => {
  test('read built-in with quoted path uses runRead', async () => {
    const readCall = {
      message: 'Read a file',
      plan: [],
      command: {
        run: 'read "./docs/some file.md"',
        cwd: '/repo',
      },
    };

    const followUp = {
      message: 'Follow-up',
      plan: [],
      command: null,
    };

    const runReadFn = jest.fn().mockResolvedValue({
      stdout: 'mock content',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 2,
    });

    const { runWithPrompts, runReadFn: configuredRead, responsesCreate } = createRuntimeWithQueue(
      [buildResponsePayload(readCall), buildResponsePayload(followUp)],
      { runReadFn },
    );

    await runWithPrompts();

    expect(responsesCreate).toHaveBeenCalledTimes(2);
    expect(configuredRead).toHaveBeenCalledTimes(1);
    expect(configuredRead).toHaveBeenCalledWith({ path: './docs/some file.md' }, '/repo');
  });

  test('read built-in parses numeric options', async () => {
    const readCall = {
      message: 'Read with limits',
      plan: [],
      command: {
        run: 'read ./logs/app.log --max-lines 5 --max-bytes 120 --encoding utf8',
      },
    };

    const followUp = {
      message: 'follow-up',
      plan: [],
      command: null,
    };

    const runReadFn = jest.fn().mockResolvedValue({
      stdout: 'mock content',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 2,
    });

    const { runWithPrompts, runReadFn: configuredRead } = createRuntimeWithQueue(
      [buildResponsePayload(readCall), buildResponsePayload(followUp)],
      { runReadFn },
    );

    await runWithPrompts();

    expect(configuredRead).toHaveBeenCalledWith(
      {
        path: './logs/app.log',
        max_lines: 5,
        max_bytes: 120,
        encoding: 'utf8',
      },
      '.',
    );
  });

  test('browse built-in with quoted url uses runBrowse', async () => {
    const browseCall = {
      message: 'Browse for docs',
      plan: [],
      command: {
        run: 'browse "https://example.com/search?q=open agent"',
        timeout_sec: 15,
      },
    };

    const followUp = {
      message: 'done',
      plan: [],
      command: null,
    };

    const runBrowseFn = jest.fn().mockResolvedValue({
      stdout: 'page content',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 3,
    });

    const { runWithPrompts, runBrowseFn: configuredBrowse } = createRuntimeWithQueue(
      [buildResponsePayload(browseCall), buildResponsePayload(followUp)],
      { runBrowseFn },
    );

    await runWithPrompts();

    expect(configuredBrowse).toHaveBeenCalledWith('https://example.com/search?q=open agent', 15);
  });
});
