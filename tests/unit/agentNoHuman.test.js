const { createAgentLoop } = require('../../src/agent/loop');

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

describe('no-human mode automation', () => {
  test('auto-responds until assistant signals done', async () => {
    const responsesQueue = [
      buildResponsePayload({
        message: 'Working on it',
        plan: [],
        command: {
          run: ['echo', 'hi'],
          cwd: '.',
          timeout_sec: 5,
        },
      }),
      buildResponsePayload({
        message: 'Need more input',
        plan: [],
        command: null,
      }),
      buildResponsePayload({
        message: 'done',
        plan: [],
        command: null,
      }),
    ];

    const responsesCreate = jest.fn(() => {
      if (!responsesQueue.length) {
        throw new Error('No more responses in queue');
      }
      return responsesQueue.shift();
    });

    const askHumanFn = jest
      .fn()
      .mockResolvedValueOnce('Build a thing')
      .mockResolvedValueOnce('exit');

    const closeFn = jest.fn();

    const runCommandFn = jest.fn().mockResolvedValue({
      stdout: 'hi\n',
      stderr: '',
      exit_code: 0,
      killed: false,
      runtime_ms: 3,
    });

    const setNoHumanFlagMock = jest.fn();

    const loop = createAgentLoop({
      getClient: () => ({ responses: { create: responsesCreate } }),
      model: 'test-nohuman',
      createInterfaceFn: () => ({ close: closeFn }),
      askHumanFn,
      startThinkingFn: jest.fn(),
      stopThinkingFn: jest.fn(),
      renderPlanFn: jest.fn(),
      renderMessageFn: jest.fn(),
      renderCommandFn: jest.fn(),
      renderCommandResultFn: jest.fn(),
      runCommandFn,
      runBrowseFn: jest.fn(),
      runEditFn: jest.fn(),
      runReadFn: jest.fn(),
      runReplaceFn: jest.fn(),
      applyFilterFn: (text) => text,
      tailLinesFn: (text) => text,
      isPreapprovedCommandFn: () => false,
      isSessionApprovedFn: () => false,
      approveForSessionFn: jest.fn(),
      preapprovedCfg: { allowlist: [] },
      getAutoApproveFlag: () => false,
      getNoHumanFlag: () => true,
      setNoHumanFlag: setNoHumanFlagMock,
    });

    await loop();

    expect(askHumanFn).toHaveBeenCalledTimes(2);
    expect(responsesCreate).toHaveBeenCalledTimes(3);
    expect(runCommandFn).toHaveBeenCalledTimes(1);
    expect(closeFn).toHaveBeenCalled();
    expect(setNoHumanFlagMock).toHaveBeenCalledWith(false);

    // Ensure that the auto-response was provided before the final model call.
    const thirdCallInput = responsesCreate.mock.calls[2][0].input;
    const lastUserMessage = [...thirdCallInput].reverse().find((entry) => entry.role === 'user');
    expect(lastUserMessage.content).toBe("continue or say 'done'");
  });
});
