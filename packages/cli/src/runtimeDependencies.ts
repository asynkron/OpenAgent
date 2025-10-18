import {
  applyFilter,
  approveForSession,
  getAutoApproveFlag,
  getDebugFlag,
  getNoHumanFlag,
  getPlanMergeFlag,
  incrementCommandCount,
  isPreapprovedCommand,
  isSessionApproved,
  PREAPPROVED_CFG,
  runCommand as coreRunCommand,
  setNoHumanFlag,
  tailLines,
  type AgentRuntimeOptions,
  type CommandResult,
} from '@asynkron/openagent-core';

export type CliAgentRuntimeDependencies = {
  getAutoApproveFlag: NonNullable<AgentRuntimeOptions['getAutoApproveFlag']>;
  getNoHumanFlag: NonNullable<AgentRuntimeOptions['getNoHumanFlag']>;
  getPlanMergeFlag: NonNullable<AgentRuntimeOptions['getPlanMergeFlag']>;
  getDebugFlag: NonNullable<AgentRuntimeOptions['getDebugFlag']>;
  setNoHumanFlag: NonNullable<AgentRuntimeOptions['setNoHumanFlag']>;
  runCommandFn: NonNullable<AgentRuntimeOptions['runCommandFn']>;
  applyFilterFn: NonNullable<AgentRuntimeOptions['applyFilterFn']>;
  tailLinesFn: NonNullable<AgentRuntimeOptions['tailLinesFn']>;
  isPreapprovedCommandFn: NonNullable<AgentRuntimeOptions['isPreapprovedCommandFn']>;
  isSessionApprovedFn: NonNullable<AgentRuntimeOptions['isSessionApprovedFn']>;
  approveForSessionFn: NonNullable<AgentRuntimeOptions['approveForSessionFn']>;
  preapprovedCfg: AgentRuntimeOptions['preapprovedCfg'];
};

export type RuntimeOptions = AgentRuntimeOptions;

export function createCliDependencies(): CliAgentRuntimeDependencies {
  return {
    getAutoApproveFlag,
    getNoHumanFlag,
    getPlanMergeFlag,
    getDebugFlag,
    setNoHumanFlag,
    runCommandFn: coreRunCommand,
    applyFilterFn: applyFilter,
    tailLinesFn: tailLines,
    isPreapprovedCommandFn: isPreapprovedCommand,
    isSessionApprovedFn: isSessionApproved,
    approveForSessionFn: approveForSession,
    preapprovedCfg: PREAPPROVED_CFG as CliAgentRuntimeDependencies['preapprovedCfg'],
  };
}

// Produces the dependency bundle the core runtime expects, while still allowing overrides for tests.
export function normalizeRuntimeOptions(
  overrides: RuntimeOptions = {},
): AgentRuntimeOptions & CliAgentRuntimeDependencies {
  return {
    ...createCliDependencies(),
    ...overrides,
  };
}

export async function recordCommandStat(commandKey: string): Promise<void> {
  try {
    await incrementCommandCount(commandKey);
  } catch {
    // Swallow stat persistence errors to avoid blocking the CLI.
  }
}

export type { CommandResult };
