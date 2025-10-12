import React from 'react';
import { render, type Instance } from 'ink';

import coreRuntime from '@asynkron/openagent-core';
import CliApp from './components/CliApp.js';

type RunCommandInput = string | string[];

type RuntimeOptions = Record<string, unknown>;

type CoreBindings = {
  getAutoApproveFlag: () => boolean;
  getNoHumanFlag: () => boolean;
  getPlanMergeFlag: () => boolean;
  getDebugFlag: () => boolean;
  setNoHumanFlag: (value: boolean) => void;
  createAgentRuntime: (options: Record<string, unknown>) => unknown;
  runCommand: (command: RunCommandInput, cwd?: string, timeoutSec?: number) => Promise<unknown>;
  isPreapprovedCommand: (...args: unknown[]) => boolean;
  isSessionApproved: (...args: unknown[]) => boolean;
  approveForSession: (...args: unknown[]) => unknown;
  PREAPPROVED_CFG: unknown;
  applyFilter: (...args: unknown[]) => unknown;
  tailLines: (...args: unknown[]) => unknown;
  incrementCommandCount: (key: string) => Promise<unknown>;
};

const {
  getAutoApproveFlag,
  getNoHumanFlag,
  getPlanMergeFlag,
  getDebugFlag,
  setNoHumanFlag,
  createAgentRuntime,
  runCommand,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
  applyFilter,
  tailLines,
  incrementCommandCount,
} = coreRuntime as unknown as CoreBindings;

export async function runCommandAndTrack(
  run: RunCommandInput,
  cwd: string = '.',
  timeoutSec: number = 60,
) {
  const result = await runCommand(run, cwd, timeoutSec);
  try {
    let key = 'unknown';
    if (Array.isArray(run) && run.length > 0) key = String(run[0]);
    else if (typeof run === 'string' && run.trim().length > 0) key = run.trim().split(/\s+/)[0];
    await incrementCommandCount(key).catch(() => {});
  } catch (err) {
    // Ignore stats failures intentionally.
  }
  return result;
}

async function runAgentLoopWithCurrentDependencies(options: RuntimeOptions = {}): Promise<void> {
  const runtime = createAgentRuntime({
    getAutoApproveFlag,
    getNoHumanFlag,
    getPlanMergeFlag,
    getDebugFlag,
    setNoHumanFlag,
    runCommandFn: runCommand,
    applyFilterFn: applyFilter,
    tailLinesFn: tailLines,
    isPreapprovedCommandFn: isPreapprovedCommand,
    isSessionApprovedFn: isSessionApproved,
    approveForSessionFn: approveForSession,
    preapprovedCfg: PREAPPROVED_CFG,
    ...options,
  });

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

export async function agentLoop(options: RuntimeOptions = {}): Promise<void> {
  return runAgentLoopWithCurrentDependencies(options);
}

export default {
  agentLoop,
  runCommandAndTrack,
};
