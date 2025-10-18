import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import {
  register as registerCancellation,
  type CancellationRegistration,
} from '../utils/cancellation.js';
import { appendLine, createDetailMessage } from './commandHelpers.js';
import {
  cleanupTempDir,
  safeClose,
  safeReadFile,
} from './tempFileManager.js';
import type { CommandResult } from './commandTypes.js';
import { type CommandExecutionState } from './commandExecutionTypes.js';

export function startExecution(state: CommandExecutionState): void {
  registerCancellationToken(state);
  spawnChild(state);
}

function registerCancellationToken(state: CommandExecutionState): void {
  const handler = (reason?: unknown): void => {
    handleCancel(state, reason);
  };

  state.cancelHandler = handler;
  state.cancellation = registerCancellation({
    description: state.setup.operationDescription,
    onCancel: handler,
  });
}

function spawnChild(state: CommandExecutionState): void {
  try {
    state.child = spawn(state.setup.trimmedCommand, state.setup.spawnOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finalize(state, {
      stdout: '',
      stderr: message,
      exit_code: null,
      killed: false,
      runtime_ms: elapsedMs(state),
    });
    return;
  }

  applyInitialInput(state);
  observeCancellationState(state);
  attachChildListeners(state);
  registerTimeout(state);
}

function applyInitialInput(state: CommandExecutionState): void {
  const { child } = state;
  if (!child || !child.stdin) {
    return;
  }

  if (state.setup.stdin !== undefined) {
    try {
      child.stdin.write(state.setup.stdin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.artifacts.stderrExtras = appendLine(state.artifacts.stderrExtras, message);
    }
  }

  if (state.setup.io.effectiveCloseStdin) {
    child.stdin.end();
  }
}

function observeCancellationState(state: CommandExecutionState): void {
  const cancellation = state.cancellation as CancellationRegistration | null;
  if (!cancellation || !state.cancelHandler) {
    return;
  }

  if (cancellation.isCanceled()) {
    handleCancel(state, 'Command canceled before start.');
    return;
  }

  cancellation.setCancelCallback(state.cancelHandler);
}

function attachChildListeners(state: CommandExecutionState): void {
  const { child } = state;
  if (!child) {
    return;
  }

  child.on('error', (error) => {
    if (state.settled) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    state.artifacts.stderrExtras = appendLine(state.artifacts.stderrExtras, message);
    complete(state, null);
  });

  child.on('close', (code) => {
    complete(state, code);
  });
}

function registerTimeout(state: CommandExecutionState): void {
  const timeoutMs = Math.max(0, (state.setup.timeoutSec ?? 60) * 1000);
  if (timeoutMs <= 0) {
    return;
  }

  state.timeoutHandle = setTimeout(() => {
    if (state.settled) {
      return;
    }
    state.killed = true;
    state.timedOut = true;
    terminateChild(state);
  }, timeoutMs);
}

function terminateChild(state: CommandExecutionState): void {
  const { child } = state;
  if (!child) {
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Ignore kill errors.
  }

  state.forceKillHandle = setTimeout(() => {
    const activeChild: ChildProcess | null = state.child;
    if (state.settled || !activeChild) {
      return;
    }
    try {
      activeChild.kill('SIGKILL');
    } catch {
      // Ignore kill errors.
    }
  }, 1000);
}

function handleCancel(state: CommandExecutionState, reason?: unknown): void {
  if (state.settled) {
    return;
  }

  state.killed = true;
  state.canceled = true;

  if (state.child) {
    terminateChild(state);
    return;
  }

  const detailMessage =
    createDetailMessage('canceled', state.setup.timeoutSec, state.setup.commandLabel) ||
    (reason ? `Command was canceled: ${String(reason)}` : 'Command was canceled.');

  finalize(state, {
    stdout: '',
    stderr: detailMessage,
    exit_code: null,
    killed: true,
    runtime_ms: elapsedMs(state),
  });
}

function complete(state: CommandExecutionState, code: number | null): void {
  closeOutputFds(state);

  const stdoutContent = safeReadFile(state.artifacts.stdoutPath);
  let stderrContent = safeReadFile(state.artifacts.stderrPath);

  if (state.artifacts.stderrExtras) {
    stderrContent = appendLine(stderrContent, state.artifacts.stderrExtras);
  }

  if (state.timedOut || state.canceled) {
    const marker = state.timedOut
      ? 'Command timed out and was terminated.'
      : 'Command was canceled.';
    stderrContent = appendLine(stderrContent, marker);

    const detail = createDetailMessage(
      state.timedOut ? 'timeout' : 'canceled',
      state.setup.timeoutSec,
      state.setup.commandLabel,
    );
    if (detail) {
      stderrContent = appendLine(stderrContent, detail);
    }
  }

  finalize(state, {
    stdout: stdoutContent,
    stderr: stderrContent,
    exit_code: code,
    killed: state.killed,
    runtime_ms: elapsedMs(state),
  });
}

function finalize(state: CommandExecutionState, payload: CommandResult): void {
  if (state.settled) {
    return;
  }

  state.settled = true;
  clearPendingTimers(state);
  closeOutputFds(state);
  cleanupTempDir(state.artifacts.tempDir);
  unregisterCancellation(state);
  if (state.resolve) {
    state.resolve(payload);
    state.resolve = null;
  }
}

function unregisterCancellation(state: CommandExecutionState): void {
  const cancellation = state.cancellation as CancellationRegistration | null;
  if (!cancellation) {
    return;
  }

  try {
    cancellation.unregister();
  } catch {
    // Ignore unregister errors.
  }
  state.cancellation = null;
  state.cancelHandler = null;
}

function clearPendingTimers(state: CommandExecutionState): void {
  if (state.timeoutHandle) {
    clearTimeout(state.timeoutHandle);
    state.timeoutHandle = undefined;
  }

  if (state.forceKillHandle) {
    clearTimeout(state.forceKillHandle);
    state.forceKillHandle = undefined;
  }
}

function closeOutputFds(state: CommandExecutionState): void {
  safeClose(state.artifacts.stdoutFd);
  safeClose(state.artifacts.stderrFd);
}

function elapsedMs(state: CommandExecutionState): number {
  return Date.now() - state.startTime;
}
