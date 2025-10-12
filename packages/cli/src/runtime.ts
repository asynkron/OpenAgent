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
} from '@asynkron/openagent-core';

import CliApp from './components/CliApp.js';

type RunCommandInput = string | readonly string[];

type AgentRuntimeConfig = Parameters<typeof createAgentRuntime>[0];

type AgentRuntimeDependencies = Required<
  Pick<
    AgentRuntimeConfig,
    | 'getAutoApproveFlag'
    | 'getNoHumanFlag'
    | 'getPlanMergeFlag'
    | 'getDebugFlag'
    | 'setNoHumanFlag'
    | 'runCommandFn'
    | 'applyFilterFn'
    | 'tailLinesFn'
    | 'isPreapprovedCommandFn'
    | 'isSessionApprovedFn'
    | 'approveForSessionFn'
    | 'preapprovedCfg'
  >
>;

type RuntimeOptions = AgentRuntimeConfig;

function determineCommandKey(command: RunCommandInput): string {
  if (Array.isArray(command)) {
    const [firstSegment] = command;
    return typeof firstSegment === 'string' && firstSegment.trim().length > 0
      ? firstSegment.trim()
      : 'unknown';
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

function normalizeRuntimeOptions(overrides: RuntimeOptions = {} as RuntimeOptions): AgentRuntimeConfig {
  const baseDependencies = {
    getAutoApproveFlag,
    getNoHumanFlag,
    getPlanMergeFlag,
    getDebugFlag,
    setNoHumanFlag: ((value?: Parameters<typeof setNoHumanFlag>[0]) =>
      setNoHumanFlag(value)) as AgentRuntimeDependencies['setNoHumanFlag'],
    runCommandFn: coreRunCommand,
    applyFilterFn: applyFilter,
    tailLinesFn: tailLines,
    isPreapprovedCommandFn: isPreapprovedCommand,
    isSessionApprovedFn: isSessionApproved,
    approveForSessionFn: approveForSession,
    preapprovedCfg: PREAPPROVED_CFG,
  } satisfies AgentRuntimeDependencies;

  return { ...baseDependencies, ...overrides };
}

export async function runCommandAndTrack(
  run: RunCommandInput,
  cwd: string = '.',
  timeoutSec: number = 60,
): Promise<Awaited<ReturnType<typeof coreRunCommand>>> {
  const result = await coreRunCommand(run, cwd, timeoutSec, undefined);
  try {
    const key = determineCommandKey(run);
    await incrementCommandCount(key).catch(() => {});
  } catch (err) {
    // Ignore stats failures intentionally.
  }
  return result;
}

async function runAgentLoopWithCurrentDependencies(options: RuntimeOptions = {} as RuntimeOptions): Promise<void> {
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
        runtime,
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
