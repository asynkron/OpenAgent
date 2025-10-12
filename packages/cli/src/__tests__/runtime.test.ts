import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

const runCommandMock = jest.fn(async () => ({
  stdout: 'ok',
  stderr: '',
  exit_code: 0,
  killed: false,
  runtime_ms: 1,
}));

const incrementCommandCountMock = jest.fn(async () => true);

const createAgentRuntimeMock = jest.fn(() => ({
  start: jest.fn(async () => {}),
  submitPrompt: jest.fn(),
  cancel: jest.fn(),
  getHistorySnapshot: jest.fn(() => []),
  outputs: {},
  inputs: {},
}));

const renderMock = jest.fn((element: { props?: Record<string, unknown> }) => {
  element?.props?.onRuntimeComplete?.();
  return {
    waitUntilExit: jest.fn(async () => {}),
  };
});

async function importRuntime() {
  jest.resetModules();
  process.env = { ...defaultEnv };

  jest.unstable_mockModule('@asynkron/openagent-core', () => ({
    applyFilter: jest.fn((value: string) => value),
    approveForSession: jest.fn(),
    createAgentRuntime: createAgentRuntimeMock,
    getAutoApproveFlag: jest.fn(() => false),
    getDebugFlag: jest.fn(() => false),
    getNoHumanFlag: jest.fn(() => false),
    getPlanMergeFlag: jest.fn(() => false),
    incrementCommandCount: incrementCommandCountMock,
    isPreapprovedCommand: jest.fn(() => false),
    isSessionApproved: jest.fn(() => false),
    PREAPPROVED_CFG: {},
    runCommand: runCommandMock,
    setNoHumanFlag: jest.fn(),
    tailLines: jest.fn((value: string) => value),
  }));

  jest.unstable_mockModule('../components/CliApp.js', () => ({
    default: function CliApp() {
      return null;
    },
  }));

  jest.unstable_mockModule('ink', () => ({
    render: renderMock,
  }));

  return import('../runtime.ts');
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('runCommandAndTrack', () => {
  test('invokes the core command runner and records stats', async () => {
    const runtime = await importRuntime();
    await runtime.runCommandAndTrack('git status', '/tmp', 5);

    expect(runCommandMock).toHaveBeenCalledWith('git status', '/tmp', 5, undefined);
    expect(incrementCommandCountMock).toHaveBeenCalledWith('git');
  });

  test('derives a command key from array input', async () => {
    const runtime = await importRuntime();
    await runtime.runCommandAndTrack(['npm', 'test'], '.', 60);

    expect(runCommandMock).toHaveBeenCalledWith(['npm', 'test'], '.', 60, undefined);
    expect(incrementCommandCountMock).toHaveBeenCalledWith('npm');
  });
});

describe('agentLoop', () => {
  test('normalizes runtime dependencies before creating the agent runtime', async () => {
    const runtime = await importRuntime();
    await runtime.agentLoop({ systemPromptAugmentation: 'boot info' });

    expect(createAgentRuntimeMock).toHaveBeenCalledTimes(1);
    const options = createAgentRuntimeMock.mock.calls[0]?.[0] ?? {};

    expect(typeof options.getAutoApproveFlag).toBe('function');
    expect(typeof options.runCommandFn).toBe('function');
    expect(options.systemPromptAugmentation).toBe('boot info');
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
