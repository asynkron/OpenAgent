import type { SpawnOptions } from 'node:child_process';


import { register as registerCancellation } from '../utils/cancellation.js';
import { createEscWaiter, setEscActivePromise, clearEscActivePromise, resetEscState, type EscState } from '../agent/escState.js';
import { substituteBuiltinCommand } from './commandSubstitution.js';
import { getCommandLabel, getOperationDescription } from './commandHelpers.js';
import { prepareTempOutputs } from './tempFileManager.js';
import {
  executeCommand,
  type CommandTempArtifacts,
  type ExecutionSetup,
  type IoBehavior,
} from './commandExecution.js';
import type {
  CommandResult,
  RunOptions,
} from './commandTypes.js';
export type { CommandResult, PartialCommandResult, RunOptions } from './commandTypes.js';

interface NormalizedRunOptions {
  shell: string | boolean | undefined;
  stdin: string | undefined;
  closeStdin: boolean | undefined;
  commandLabel: string | undefined;
  description: string | undefined;
}

function normalizeRunOptions(input?: string | boolean | RunOptions): NormalizedRunOptions {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      shell: input.shell,
      stdin: input.stdin,
      closeStdin: input.closeStdin,
      commandLabel: input.commandLabel,
      description: input.description,
    };
  }

  // Run each command inside its own process group so cancellation signals reach
  // every descendant process before the force-kill fallback fires.
  return {
    shell: input as string | boolean | undefined,
    stdin: undefined,
    closeStdin: undefined,
    commandLabel: undefined,
    description: undefined,
  };
}

function evaluateIoBehavior(stdin: string | undefined, closeStdin: boolean | undefined): IoBehavior {
  const effectiveCloseStdin = closeStdin !== undefined ? Boolean(closeStdin) : stdin === undefined;
  const shouldPipeStdin = stdin !== undefined || effectiveCloseStdin === false;
  return { effectiveCloseStdin, shouldPipeStdin };
}

function createSpawnOptions(
  cwd: string | undefined,
  io: IoBehavior,
  shell: string | boolean | undefined,
  artifacts: CommandTempArtifacts,
): SpawnOptions {
  const normalizedShell = shell !== undefined ? shell : true;

  return {
    cwd,
    shell: normalizedShell,
    stdio: [io.shouldPipeStdin ? 'pipe' : 'ignore', artifacts.stdoutFd, artifacts.stderrFd],
    detached: true,
  };
}

function prepareArtifacts(): CommandTempArtifacts {
  const tempOutputs = prepareTempOutputs();
  return { ...tempOutputs, stderrExtras: '' };
}

export async function runCommand(
  cmd: unknown,
  cwd: string | undefined,
  timeoutSec: number | null | undefined,
  shellOrOptions?: string | boolean | RunOptions,
): Promise<CommandResult> {
  if (typeof cmd !== 'string') {
    throw new TypeError('runCommand expects a normalized command string.');
  }

  const normalizedCommand = substituteBuiltinCommand(cmd);

  if (typeof normalizedCommand !== 'string') {
    throw new TypeError('runCommand expects a normalized command string.');
  }

  const trimmedCommand = normalizedCommand.trim();

  let artifacts: CommandTempArtifacts;
  try {
    artifacts = prepareArtifacts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = message ? message : 'unknown error';
    return {
      stdout: '',
      stderr: `Failed to prepare command capture: ${detail}`,
      exit_code: null,
      killed: false,
      runtime_ms: 0,
    };
  }

  const normalizedOptions = normalizeRunOptions(shellOrOptions);
  const commandLabel = getCommandLabel(normalizedOptions.commandLabel ?? '', trimmedCommand);
  const operationDescription = getOperationDescription(normalizedOptions.description ?? '', commandLabel);
  const io = evaluateIoBehavior(normalizedOptions.stdin, normalizedOptions.closeStdin);
  const spawnOptions = createSpawnOptions(cwd, io, normalizedOptions.shell, artifacts);

  const setup: ExecutionSetup = {
    trimmedCommand,
    commandLabel,
    operationDescription,
    spawnOptions,
    stdin: normalizedOptions.stdin,
    io,
    timeoutSec,
  };

  return executeCommand(setup, artifacts);
}

export default {
  runCommand,
};
