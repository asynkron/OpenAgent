import { RuntimeEventType } from '@asynkron/openagent-core';
import React from 'react';
import { render } from 'ink';

import { createAgentRuntime, runCommand as coreRunCommand } from '@asynkron/openagent-core';

import CliApp from './components/CliApp.js';
import type { AgentRuntimeLike } from './components/cliApp/types.js';
import { createRuntimeLifecycle } from './runtimeLifecycle.js';
import {
  normalizeRuntimeOptions,
  recordCommandStat,
  type CommandResult,
  type RuntimeOptions,
} from './runtimeDependencies.js';

type RunCommandInput = string | readonly string[];

const UNKNOWN_COMMAND_KEY = 'unknown';

function determineCommandKey(command: RunCommandInput): string {
  if (Array.isArray(command)) {
    const [firstSegment] = command;
    const first = typeof firstSegment === 'string' ? firstSegment.trim() : '';
    return first.length > 0 ? first : UNKNOWN_COMMAND_KEY;
  }

  if (typeof command === 'string') {
    const normalized = command.trim();
    if (normalized.length === 0) {
      return UNKNOWN_COMMAND_KEY;
    }
    return normalized.split(/\s+/u)[0] ?? UNKNOWN_COMMAND_KEY;
  }

  return UNKNOWN_COMMAND_KEY;
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

async function runAgentLoopWithCurrentDependencies(
  options: RuntimeOptions = {} as RuntimeOptions,
): Promise<void> {
  const runtime = createAgentRuntime(normalizeRuntimeOptions(options));
  const lifecycle = createRuntimeLifecycle();

  const app = render(
    React.createElement(CliApp, {
      runtime: runtime as unknown as AgentRuntimeLike,
      onRuntimeComplete: lifecycle.handleComplete,
      onRuntimeError: lifecycle.handleError,
    }),
    { exitOnCtrlC: false },
  );

  lifecycle.observeExit(app);

  await lifecycle.promise;
}

export async function agentLoop(options: RuntimeOptions = {} as RuntimeOptions): Promise<void> {
  return runAgentLoopWithCurrentDependencies(options);
}

export default {
  agentLoop,
  runCommandAndTrack,
};
