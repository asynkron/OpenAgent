import React from 'react';
import { render, type Instance } from 'ink';

import {
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
} from '@asynkron/openagent-core';
import CliApp from './components/CliApp.js';

type RunCommandInput = string | string[];

type AgentRuntime = ReturnType<typeof createAgentRuntime>;

type RuntimeOptions = Record<string, unknown>;

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
