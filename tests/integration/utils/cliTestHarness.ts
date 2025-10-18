import { loadAgentWithMockedModules } from '../agentRuntimeTestHarness.js';
import { createTestRunnerUI } from '../testRunnerUI.js';

interface RunCommandResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  killed: boolean;
  runtime_ms: number;
}

type RunCommandFunction = (
  command: string,
  cwd: string,
  timeoutSec: number,
  shell: string,
) => Promise<RunCommandResult>;

interface RuntimeOverrides {
  getAutoApproveFlag?: () => boolean;
  runCommandFn?: RunCommandFunction;
  isPreapprovedCommandFn?: () => boolean;
  emitAutoApproveStatus?: boolean;
}

interface TestUIConfig {
  onEvent?: (event: { type: string }) => void;
}

interface BootTestCLIOptions {
  autoApprove?: boolean;
  runtime?: RuntimeOverrides;
  ui?: TestUIConfig;
}

export async function bootTestCLI(options: BootTestCLIOptions = {}) {
  process.env.OPENAI_API_KEY = 'test-key';
  const harness = await loadAgentWithMockedModules();
  const { agent, mocks, createTestPlanManager } = harness;

  if (options.autoApprove === true) {
    agent.STARTUP_FORCE_AUTO_APPROVE = true;
  } else if (options.autoApprove === false) {
    agent.STARTUP_FORCE_AUTO_APPROVE = false;
  }

  const runtimeOverrides = options.runtime ?? {};
  const runtimeConfig = {
    createPlanManagerFn: createTestPlanManager,
    getAutoApproveFlag:
      runtimeOverrides.getAutoApproveFlag ?? (() => agent.STARTUP_FORCE_AUTO_APPROVE),
  } as {
    createPlanManagerFn: typeof createTestPlanManager;
    getAutoApproveFlag: () => boolean;
    runCommandFn?: RunCommandFunction;
    isPreapprovedCommandFn?: () => boolean;
    emitAutoApproveStatus?: boolean;
  };

  if (runtimeOverrides.runCommandFn) {
    runtimeConfig.runCommandFn = runtimeOverrides.runCommandFn;
  }

  if (runtimeOverrides.isPreapprovedCommandFn) {
    runtimeConfig.isPreapprovedCommandFn = runtimeOverrides.isPreapprovedCommandFn;
  }

  if (runtimeOverrides.emitAutoApproveStatus !== undefined) {
    runtimeConfig.emitAutoApproveStatus = runtimeOverrides.emitAutoApproveStatus;
  }

  const runtime = agent.createAgentRuntime(runtimeConfig);

  const uiOptions = options.ui ?? {};
  const ui = createTestRunnerUI(runtime, uiOptions);

  return {
    agent,
    runtime,
    ui,
    mocks,
    createTestPlanManager,
  };
}
