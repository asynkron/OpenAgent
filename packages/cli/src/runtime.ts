import React from 'react';
import { render, type Instance } from 'ink';

import {
  applyFilter,
  approveForSession,
  createAgentRuntime,
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

import CliApp from './components/CliApp.js';
import type { AgentRuntimeLike } from './components/cliApp/types.js';

type RunCommandInput = string | readonly string[];

type CliAgentRuntimeDependencies = {
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

type RuntimeOptions = AgentRuntimeOptions;

function determineCommandKey(command: RunCommandInput): string {
  if (Array.isArray(command)) {
    const [firstSegment] = command;
    const first = typeof firstSegment === 'string' ? firstSegment.trim() : '';
    return first.length > 0 ? first : 'unknown';
  }

  if (typeof command === 'string') {
    const normalized = command.trim();
    if (normalized.length === 0) {
      return 'unknown';
    }
    return normalized.split(/\s+/u)[0] ?? 'unknown';
  }

  return 'unknown';
}

function normalizeRuntimeOptions(
  overrides: RuntimeOptions = {},
): AgentRuntimeOptions & CliAgentRuntimeDependencies {
  const baseDependencies: CliAgentRuntimeDependencies = {
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

  const normalized: AgentRuntimeOptions & CliAgentRuntimeDependencies = {
    ...baseDependencies,
    ...overrides,
  };

  return normalized;
}

export async function runCommandAndTrack(
  run: RunCommandInput,
  cwd: string = '.',
  timeoutSec: number = 60,
): Promise<CommandResult> {
  const result = await coreRunCommand(run, cwd, timeoutSec);
  const key = determineCommandKey(run);
  await recordCommandStat(key);
  return result;
}

async function recordCommandStat(commandKey: string): Promise<void> {
  try {
    await incrementCommandCount(commandKey);
  } catch {
    // Swallow stat persistence errors to avoid blocking the CLI.
  }
}

async function runAgentLoopWithCurrentDependencies(
  options: RuntimeOptions = {} as RuntimeOptions,
): Promise<void> {
  const runtime = createAgentRuntime(normalizeRuntimeOptions(options));

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const handleResolve = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const handleReject = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const app: Instance = render(
      React.createElement(CliApp, {
        runtime: runtime as unknown as AgentRuntimeLike,
        onRuntimeComplete: handleResolve,
        onRuntimeError: handleReject,
      }),
      { exitOnCtrlC: false },
    );

    app.waitUntilExit().catch((error: unknown) => {
      handleReject(error);
    });
  });
}

export async function agentLoop(options: RuntimeOptions = {} as RuntimeOptions): Promise<void> {
  return runAgentLoopWithCurrentDependencies(options);
}

export default {
  agentLoop,
  runCommandAndTrack,
};
