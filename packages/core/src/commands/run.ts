import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import { register as registerCancellation } from '../utils/cancellation.js';
import { substituteBuiltinCommand } from './commandSubstitution.js';
import {
  prepareTempOutputs,
  safeClose,
  safeReadFile,
  cleanupTempDir,
  type TempOutputs,
} from './tempFileManager.js';
import {
  appendLine,
  createDetailMessage,
  getCommandLabel,
  getOperationDescription,
} from './commandHelpers.js';

export interface RunOptions {
  shell?: string | boolean;
  stdin?: string;
  closeStdin?: boolean;
  commandLabel?: string;
  description?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  killed: boolean;
  runtime_ms: number;
}

export type PartialCommandResult = Partial<CommandResult>;

export async function runCommand(
  cmd: unknown,
  cwd: string | undefined,
  timeoutSec: number | null | undefined,
  shellOrOptions: string | boolean | RunOptions | undefined,
): Promise<CommandResult> {
  if (typeof cmd !== 'string') {
    throw new TypeError('runCommand expects a normalized command string.');
  }

  const normalizedCommand = substituteBuiltinCommand(cmd);

  if (typeof normalizedCommand !== 'string') {
    throw new TypeError('runCommand expects a normalized command string.');
  }

  const trimmedCommand = normalizedCommand.trim();

  return new Promise((resolve) => {
    const startTime = Date.now();
    let child: ChildProcess | null = null;
    let killed = false;
    let canceled = false;
    let timedOut = false;
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let forceKillHandle: NodeJS.Timeout | undefined;
    let tempData: (TempOutputs & { stderrExtras: string }) | null = null;

    let tempPrepError: Error | null = null;
    try {
      const temp = prepareTempOutputs();
      tempData = { ...temp, stderrExtras: '' };
    } catch (error) {
      tempPrepError = error instanceof Error ? error : new Error(String(error));
    }

    if (tempPrepError || !tempData) {
      resolve({
        stdout: '',
        stderr: `Failed to prepare command capture: ${tempPrepError?.message || 'unknown error'}`,
        exit_code: null,
        killed: false,
        runtime_ms: 0,
      });
      return;
    }

    const { tempDir, stdoutPath, stderrPath, stdoutFd, stderrFd } = tempData;

    const options: RunOptions =
      shellOrOptions && typeof shellOrOptions === 'object' && !Array.isArray(shellOrOptions)
        ? { ...shellOrOptions }
        : { shell: shellOrOptions as string | boolean | undefined };

    const {
      shell,
      stdin,
      closeStdin,
      commandLabel: providedLabel,
      description: providedDescription,
    } = options;

    const commandLabel = getCommandLabel(providedLabel ?? '', trimmedCommand);
    const operationDescription = getOperationDescription(providedDescription ?? '', commandLabel);
    const effectiveCloseStdin = closeStdin !== undefined ? Boolean(closeStdin) : stdin === undefined;
    const shouldPipeStdin = stdin !== undefined || effectiveCloseStdin === false;

    const spawnOptions: {
      cwd: string | undefined;
      shell: string | boolean;
      stdio: ('pipe' | 'ignore' | number)[];
    } = {
      cwd,
      shell: shell !== undefined ? shell : true,
      stdio: [shouldPipeStdin ? 'pipe' : 'ignore', stdoutFd, stderrFd],
    };

    const clearPendingTimers = (): void => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      if (forceKillHandle) {
        clearTimeout(forceKillHandle);
        forceKillHandle = undefined;
      }
    };

    const closeOutputFds = (): void => {
      safeClose(stdoutFd);
      safeClose(stderrFd);
    };

    const finalize = (
      payload: CommandResult,
      { unregisterCancellation }: { unregisterCancellation?: () => void } = {},
    ): void => {
      if (settled) return;
      settled = true;
      clearPendingTimers();
      closeOutputFds();
      cleanupTempDir(tempDir);
      if (unregisterCancellation && typeof unregisterCancellation === 'function') {
        try {
          unregisterCancellation();
        } catch {
          // Ignore unregister errors.
        }
      }
      resolve(payload);
    };

    const complete = (
      code: number | null,
      cleanup: { unregisterCancellation?: () => void } = {},
    ): void => {
      closeOutputFds();

      const stdoutContent = safeReadFile(stdoutPath);
      let stderrContent = safeReadFile(stderrPath);

      if (tempData && tempData.stderrExtras) {
        stderrContent = appendLine(stderrContent, tempData.stderrExtras);
      }

      if (timedOut || canceled) {
        const baseMarker = timedOut
          ? 'Command timed out and was terminated.'
          : 'Command was canceled.';
        stderrContent = appendLine(stderrContent, baseMarker);

        const detailMarker = createDetailMessage(
          timedOut ? 'timeout' : 'canceled',
          timeoutSec,
          commandLabel,
        );
        if (detailMarker) {
          stderrContent = appendLine(stderrContent, detailMarker);
        }
      }

      finalize(
        {
          stdout: stdoutContent,
          stderr: stderrContent,
          exit_code: code,
          killed,
          runtime_ms: Date.now() - startTime,
        },
        cleanup,
      );
    };

    const handleCancel = (reason?: unknown): void => {
      if (settled) return;
      killed = true;
      canceled = true;
      if (child) {
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore kill errors.
        }
        forceKillHandle = setTimeout(() => {
          if (!settled && child) {
            try {
              child.kill('SIGKILL');
            } catch {
              // Ignore kill errors.
            }
          }
        }, 1000);
      } else {
        const message =
          createDetailMessage('canceled', timeoutSec, commandLabel) ||
          (reason ? `Command was canceled: ${String(reason)}` : 'Command was canceled.');
        finalize(
          {
            stdout: '',
            stderr: message,
            exit_code: null,
            killed: true,
            runtime_ms: Date.now() - startTime,
          },
          { unregisterCancellation: cancellation?.unregister },
        );
      }
    };

    const cancellation = registerCancellation({
      description: operationDescription,
      onCancel: handleCancel,
    });

    try {
      child = spawn(trimmedCommand, spawnOptions as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finalize(
        {
          stdout: '',
          stderr: message,
          exit_code: null,
          killed: false,
          runtime_ms: Date.now() - startTime,
        },
        { unregisterCancellation: cancellation?.unregister },
      );
      return;
    }

    if (child.stdin) {
      if (stdin !== undefined) {
        try {
          child.stdin.write(stdin);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (tempData) {
            tempData.stderrExtras = appendLine(tempData.stderrExtras, message);
          }
        }
      }
      if (effectiveCloseStdin) {
        child.stdin.end();
      }
    }

    if (
      cancellation &&
      typeof cancellation.isCanceled === 'function' &&
      cancellation.isCanceled()
    ) {
      handleCancel('Command canceled before start.');
    } else if (cancellation && typeof cancellation.setCancelCallback === 'function') {
      cancellation.setCancelCallback(handleCancel);
    }

    child.on('error', (error) => {
      if (settled) return;
      const message = error instanceof Error ? error.message : String(error);
      if (tempData) {
        tempData.stderrExtras = appendLine(tempData.stderrExtras, message);
      }
      complete(null, { unregisterCancellation: cancellation?.unregister });
    });

    const timeoutMs = Math.max(0, (timeoutSec ?? 60) * 1000);
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        killed = true;
        timedOut = true;
        if (child) {
          try {
            child.kill('SIGTERM');
          } catch {
            // Ignore kill errors.
          }
          forceKillHandle = setTimeout(() => {
            if (!settled && child) {
              try {
                child.kill('SIGKILL');
              } catch {
                // Ignore kill errors.
              }
            }
          }, 1000);
        }
      }, timeoutMs);
    }

    child.on('close', (code) => {
      complete(code, { unregisterCancellation: cancellation?.unregister });
    });
  });
}

export default {
  runCommand,
};
