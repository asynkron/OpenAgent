import React from 'react';
import { render } from 'ink';

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

export async function runCommandAndTrack(run, cwd = '.', timeoutSec = 60) {
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

async function runAgentLoopWithCurrentDependencies(options = {}) {
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

  return new Promise((resolve, reject) => {
    let settled = false;

    const handleResolve = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const handleReject = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const app = render(
      React.createElement(CliApp, {
        runtime,
        onRuntimeComplete: handleResolve,
        onRuntimeError: handleReject,
      }),
      { exitOnCtrlC: false },
    );

    app.waitUntilExit().catch((error) => {
      handleReject(error);
    });
  });
}

export async function agentLoop(options) {
  return runAgentLoopWithCurrentDependencies(options);
}

export default {
  agentLoop,
  runCommandAndTrack,
};
