/**
 * Hosts the side-effecting primitives that execute shell commands and exposes
 * higher-level helpers for browse, edit, and read operations.
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

import { register as registerCancellation } from '../utils/cancellation.js';

import { runBrowse } from './browse.js';
import { runEdit } from './edit.js';
import { runRead } from './read.js';
import { runReplace } from './replace.js';

export async function runCommand(cmd, cwd, timeoutSec, shellOpt) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const isStringCommand = typeof cmd === 'string';
    const spawnOptions = {
      cwd,
      shell: shellOpt !== undefined ? shellOpt : isStringCommand,
    };

    let child;
    let stdout = '';
    let stderr = '';
    let killed = false;
    let canceled = false;
    let timedOut = false;
    let settled = false;
    let timeoutHandle;
    let forceKillHandle;
    let cancellation;

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

    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      clearPendingTimers();
      if (cancellation && typeof cancellation.unregister === 'function') {
        cancellation.unregister();
      }
      resolve(payload);
    };

    const complete = (code) => {
      let finalStderr = stderr;
      if (timedOut || canceled) {
        const marker = timedOut
          ? 'Command timed out and was terminated.'
          : 'Command was canceled.';
        if (!finalStderr.includes(marker)) {
          const needsNewline = finalStderr && !finalStderr.endsWith('\n');
          finalStderr = `${finalStderr}${needsNewline ? '\n' : ''}${marker}`;
        }
      }

      finalize({
        stdout,
        stderr: finalStderr,
        exit_code: code,
        killed,
        runtime_ms: Date.now() - startTime,
      });
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
        const message = reason ? String(reason) : 'Command canceled before start.';
        finalize({
          stdout: '',
          stderr: message,
          exit_code: null,
          killed: true,
          runtime_ms: Date.now() - startTime,
        });
      }
    };

    const commandLabel = isStringCommand
      ? String(cmd || '').trim()
      : Array.isArray(cmd)
      ? cmd.map((part) => String(part)).join(' ').trim()
      : '';

    cancellation = registerCancellation({
      description: commandLabel ? `shell: ${commandLabel}` : 'shell command',
      onCancel: handleCancel,
    });

    try {
      if (isStringCommand) {
        child = spawn(cmd, spawnOptions);
      } else if (Array.isArray(cmd) && cmd.length > 0) {
        child = spawn(cmd[0], cmd.slice(1), spawnOptions);
      } else {
        throw new Error('Command must be a string or a non-empty array.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finalize({
        stdout: '',
        stderr: message,
        exit_code: null,
        killed: false,
        runtime_ms: Date.now() - startTime,
      });
      return;
    }

    child.stdin?.end();

    if (cancellation && typeof cancellation.isCanceled === 'function' && cancellation.isCanceled()) {
      handleCancel('Command canceled before start.');
    } else if (cancellation && typeof cancellation.setCancelCallback === 'function') {
      cancellation.setCancelCallback(handleCancel);
    }

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) return;
      const message = error instanceof Error ? error.message : String(error);
      const needsNewline = stderr && !stderr.endsWith('\n');
      stderr = `${stderr}${needsNewline ? '\n' : ''}${message}`;
      complete(null);
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
      complete(code);
    });
  });
}

export { runBrowse, runEdit, runRead, runReplace };

export default {
  runCommand,
  runBrowse,
  runEdit,
  runRead,
  runReplace,
};
