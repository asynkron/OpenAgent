/**
 * Hosts the side-effecting primitives that execute shell commands and exposes
 * higher-level helpers for read operations.
 *
 * Responsibilities:
 * - Launch child processes with timeout handling and capture their output streams.
 * - Re-export the specialized helpers defined in their dedicated modules.
 *
 * Consumers:
 * - `src/agent/loop.js` invokes these helpers while executing assistant generated commands.
 * - Root `index.js` re-exports them for unit and integration tests.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { register as registerCancellation } from '../utils/cancellation.js';

import { runRead } from './read.js';

const SCRATCH_ROOT = resolve('.openagent', 'temp');

function prepareTempOutputs() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const tempDir = mkdtempSync(join(SCRATCH_ROOT, 'cmd-'));
  const stdoutPath = join(tempDir, 'stdout.log');
  const stderrPath = join(tempDir, 'stderr.log');
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');
  return { tempDir, stdoutPath, stderrPath, stdoutFd, stderrFd };
}

function safeClose(fd) {
  if (typeof fd !== 'number') {
    return;
  }
  try {
    closeSync(fd);
  } catch (error) {
    // Ignore close errors.
  }
}

function safeReadFile(path) {
  if (!path) {
    return '';
  }
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to read command output: ${message}`;
  }
}

function cleanupTempDir(tempDir) {
  if (!tempDir) {
    return;
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors.
  }
}

export async function runCommand(cmd, cwd, timeoutSec, shellOrOptions) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const isStringCommand = typeof cmd === 'string';
    let child;
    let killed = false;
    let canceled = false;
    let timedOut = false;
    let settled = false;
    let timeoutHandle;
    let forceKillHandle;
    let stdoutFd;
    let stderrFd;
    let stdoutPath;
    let stderrPath;
    let tempDir;
    let stderrExtras = '';

    let tempPrepError = null;
    try {
      const temp = prepareTempOutputs();
      ({ tempDir, stdoutPath, stderrPath, stdoutFd, stderrFd } = temp);
    } catch (error) {
      tempPrepError = error instanceof Error ? error : new Error(String(error));
    }

    if (tempPrepError) {
      resolve({
        stdout: '',
        stderr: `Failed to prepare command capture: ${tempPrepError.message}`,
        exit_code: null,
        killed: false,
        runtime_ms: 0,
      });
      return;
    }

    const options =
      shellOrOptions && typeof shellOrOptions === 'object' && !Array.isArray(shellOrOptions)
        ? { ...shellOrOptions }
        : { shell: shellOrOptions };

    const {
      shell,
      stdin,
      closeStdin,
      commandLabel: providedLabel,
      description: providedDescription,
    } = options;

    const spawnOptions = {
      cwd,
      shell: shell !== undefined ? shell : isStringCommand,
    };

    const appendLine = (output, line) => {
      if (!line) {
        return output;
      }
      const normalized = String(line);
      if (!normalized) {
        return output;
      }
      const needsNewline = output && !output.endsWith('\n');
      return `${output || ''}${needsNewline ? '\n' : ''}${normalized}`;
    };

    const detailFor = (kind) => {
      if (!kind) {
        return null;
      }
      const suffix = commandLabel ? ` (${commandLabel})` : '';
      if (kind === 'timeout') {
        const seconds = timeoutSec ?? 60;
        return `Command timed out after ${seconds}s${suffix}.`;
      }
      if (kind === 'canceled') {
        return `Command was canceled${suffix}.`;
      }
      return null;
    };

    const commandLabel = providedLabel
      ? String(providedLabel).trim()
      : isStringCommand
        ? String(cmd || '').trim()
        : Array.isArray(cmd)
          ? cmd
              .map((part) => String(part))
              .join(' ')
              .trim()
          : '';

    const operationDescription =
      providedDescription && String(providedDescription).trim()
        ? String(providedDescription).trim()
        : commandLabel
          ? `shell: ${commandLabel}`
          : 'shell command';

    const effectiveCloseStdin =
      closeStdin !== undefined ? Boolean(closeStdin) : stdin === undefined;

    const shouldPipeStdin = stdin !== undefined || effectiveCloseStdin === false;
    spawnOptions.stdio = [shouldPipeStdin ? 'pipe' : 'ignore', stdoutFd, stderrFd];

    const clearPendingTimers = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      if (forceKillHandle) {
        clearTimeout(forceKillHandle);
        forceKillHandle = undefined;
      }
    };

    const closeOutputFds = () => {
      safeClose(stdoutFd);
      safeClose(stderrFd);
      stdoutFd = undefined;
      stderrFd = undefined;
    };

    const finalize = (payload, { unregisterCancellation } = {}) => {
      if (settled) return;
      settled = true;
      clearPendingTimers();
      closeOutputFds();
      cleanupTempDir(tempDir);
      if (unregisterCancellation && typeof unregisterCancellation === 'function') {
        try {
          unregisterCancellation();
        } catch (error) {
          // Ignore unregister errors.
        }
      }
      resolve(payload);
    };

    const complete = (code, { unregisterCancellation } = {}) => {
      closeOutputFds();

      const stdoutContent = safeReadFile(stdoutPath);
      let stderrContent = safeReadFile(stderrPath);

      if (stderrExtras) {
        stderrContent = appendLine(stderrContent, stderrExtras);
      }

      if (timedOut || canceled) {
        const baseMarker = timedOut
          ? 'Command timed out and was terminated.'
          : 'Command was canceled.';
        stderrContent = appendLine(stderrContent, baseMarker);

        const detailMarker = detailFor(timedOut ? 'timeout' : 'canceled');
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
        { unregisterCancellation: cancellation?.unregister },
      );
    };

    const handleCancel = (reason) => {
      if (settled) return;
      killed = true;
      canceled = true;
      if (child) {
        try {
          child.kill('SIGTERM');
        } catch (err) {
          // Ignore kill errors.
        }
        forceKillHandle = setTimeout(() => {
          if (!settled) {
            try {
              child.kill('SIGKILL');
            } catch (err) {
              // Ignore kill errors.
            }
          }
        }, 1000);
      } else {
        const message =
          detailFor('canceled') ||
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
      if (isStringCommand) {
        child = spawn(cmd, spawnOptions);
      } else if (Array.isArray(cmd) && cmd.length > 0) {
        child = spawn(cmd[0], cmd.slice(1), spawnOptions);
      } else {
        let serializedCommand;
        try {
          serializedCommand = JSON.stringify(cmd);
        } catch {
          serializedCommand = undefined;
        }
        if (!serializedCommand) {
          serializedCommand = String(cmd);
        }
        throw new Error(
          `Command must be a string or a non-empty array. Received payload: ${serializedCommand}`,
        );
      }
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
          stderrExtras = appendLine(stderrExtras, message);
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
      stderrExtras = appendLine(stderrExtras, message);
      complete(null, { unregisterCancellation: cancellation?.unregister });
    });

    const timeoutMs = Math.max(0, (timeoutSec ?? 60) * 1000);
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        killed = true;
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch (err) {
          // Ignore kill errors.
        }
        forceKillHandle = setTimeout(() => {
          if (!settled) {
            try {
              child.kill('SIGKILL');
            } catch (err) {
              // Ignore kill errors.
            }
          }
        }, 1000);
      }, timeoutMs);
    }

    child.on('close', (code) => {
      complete(code, { unregisterCancellation: cancellation?.unregister });
    });
  });
}

export { runRead };

export default {
  runCommand,
  runRead,
};
