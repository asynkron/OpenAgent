import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import type { CommandRequest } from '../contracts/index.js';
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
  cwd?: string;
  timeoutSec?: number | null;
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

type CommandInput = CommandRequest | string;

type NormalizedRunConfig = {
  commandText: string;
  cwd: string | undefined;
  timeoutSec: number | null | undefined;
  shell: string | boolean;
  labelSource: string;
  descriptionSource: string;
  stdin?: string;
  closeStdin?: boolean;
};

const sanitizeTimeout = (value: number | null | undefined): number | null | undefined => {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

const normalizeRunConfig = (command: CommandInput, options: RunOptions = {}): NormalizedRunConfig => {
  const extractCommandText = (input: CommandInput): string => {
    if (typeof input === 'string') {
      return input;
    }
    if (!input || typeof input !== 'object' || typeof input.run !== 'string') {
      throw new TypeError('runCommand expects a normalized command string.');
    }
    return input.run;
  };

  const commandText = extractCommandText(command);
  const reason =
    typeof command === 'string'
      ? ''
      : typeof command.reason === 'string'
        ? command.reason.trim()
        : '';
  const cwd = (() => {
    const override = typeof options.cwd === 'string' ? options.cwd.trim() : '';
    if (override) {
      return override;
    }
    if (typeof command !== 'string' && typeof command.cwd === 'string') {
      const normalized = command.cwd.trim();
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  })();

  const timeoutFromOptions = sanitizeTimeout(options.timeoutSec);
  const timeoutFromCommand =
    typeof command === 'string' ? undefined : sanitizeTimeout(command.limits?.timeoutSec);
  const timeoutSec = timeoutFromOptions ?? timeoutFromCommand;

  const shellOverride = options.shell;
  const shellFromCommand =
    typeof command === 'string'
      ? undefined
      : typeof command.shell === 'string' && command.shell.trim()
        ? command.shell.trim()
        : undefined;
  const shell =
    typeof shellOverride === 'string' || typeof shellOverride === 'boolean'
      ? shellOverride
      : shellFromCommand ?? true;

  const trimmedCommand = typeof commandText === 'string' ? commandText.trim() : '';
  const labelSource =
    typeof options.commandLabel === 'string' && options.commandLabel.trim()
      ? options.commandLabel.trim()
      : reason;
  const descriptionSource =
    typeof options.description === 'string' && options.description.trim()
      ? options.description.trim()
      : reason;

  return {
    commandText,
    cwd,
    timeoutSec,
    shell,
    labelSource,
    descriptionSource,
    stdin: options.stdin,
    closeStdin: options.closeStdin,
  } satisfies NormalizedRunConfig;
};

export async function runCommand(
  command: CommandInput,
  options: RunOptions | string | boolean | undefined = {},
): Promise<CommandResult> {
  const mergedOptions: RunOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : typeof options === 'string' || typeof options === 'boolean'
        ? { shell: options }
        : {};

  const normalized = normalizeRunConfig(command, mergedOptions);
  const normalizedCommand = substituteBuiltinCommand(normalized.commandText);

  if (typeof normalizedCommand !== 'string') {
    throw new TypeError('runCommand expects a normalized command string.');
  }

  const trimmedCommand = normalizedCommand.trim();

  if (!trimmedCommand) {
    throw new TypeError('runCommand expects a normalized command string.');
  }

  const commandLabel = getCommandLabel(normalized.labelSource, trimmedCommand);
  const operationDescription = getOperationDescription(
    normalized.descriptionSource,
    commandLabel,
  );
  const { shell, stdin, closeStdin, cwd, timeoutSec } = normalized;

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

    const effectiveCloseStdin =
      closeStdin !== undefined ? Boolean(closeStdin) : stdin === undefined;
    const shouldPipeStdin = stdin !== undefined || effectiveCloseStdin === false;

    const spawnOptions: {
      cwd: string | undefined;
      shell: string | boolean;
      stdio: ('pipe' | 'ignore' | number)[];
    } = {
      cwd,
      shell,
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
