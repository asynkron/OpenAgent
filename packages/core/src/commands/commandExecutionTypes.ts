import type { ChildProcess, SpawnOptions } from 'node:child_process';

import type { CommandResult } from './commandTypes.js';
import type { TempOutputs } from './tempFileManager.js';
import type { CancellationRegistration } from '../utils/cancellation.js';

export interface IoBehavior {
  effectiveCloseStdin: boolean;
  shouldPipeStdin: boolean;
}

export interface CommandTempArtifacts extends TempOutputs {
  stderrExtras: string;
}

export interface ExecutionSetup {
  trimmedCommand: string;
  commandLabel: string;
  operationDescription: string;
  spawnOptions: SpawnOptions;
  stdin: string | undefined;
  io: IoBehavior;
  timeoutSec: number | null | undefined;
}

export interface CommandExecutionState {
  setup: ExecutionSetup;
  artifacts: CommandTempArtifacts;
  startTime: number;
  child: ChildProcess | null;
  killed: boolean;
  canceled: boolean;
  timedOut: boolean;
  settled: boolean;
  timeoutHandle: NodeJS.Timeout | undefined;
  forceKillHandle: NodeJS.Timeout | undefined;
  cancellation: CancellationRegistration | null;
  cancelHandler: ((reason?: unknown) => void) | null;
  resolve: ((result: CommandResult) => void) | null;
}

export function createExecutionState(
  setup: ExecutionSetup,
  artifacts: CommandTempArtifacts,
): CommandExecutionState {
  return {
    setup,
    artifacts,
    startTime: Date.now(),
    child: null,
    killed: false,
    canceled: false,
    timedOut: false,
    settled: false,
    timeoutHandle: undefined,
    forceKillHandle: undefined,
    cancellation: null,
    cancelHandler: null,
    resolve: null,
  };
}
