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
    try {
      if (isStringCommand) {
        child = spawn(cmd, spawnOptions);
      } else if (Array.isArray(cmd) && cmd.length > 0) {
        child = spawn(cmd[0], cmd.slice(1), spawnOptions);
      } else {
        throw new Error('Command must be a string or a non-empty array.');
      }
    } catch (error) {
      resolve({
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exit_code: null,
        killed: false,
        runtime_ms: 0,
      });
      return;
    }

    child.stdin?.end();

    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;
    let timeoutHandle;
    let forceKillHandle;

    const clearPendingTimers = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (forceKillHandle) {
        clearTimeout(forceKillHandle);
      }
    };

    const complete = (code) => {
      if (settled) return;
      settled = true;
      clearPendingTimers();

      if (killed) {
        const marker = 'Command timed out and was terminated.';
        if (!stderr.includes(marker)) {
          const needsNewline = stderr && !stderr.endsWith('\n');
          stderr = `${stderr}${needsNewline ? '\n' : ''}${marker}`;
        }
      }

      resolve({
        stdout,
        stderr,
        exit_code: code,
        killed,
        runtime_ms: Date.now() - startTime,
      });
    };

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
        child.kill('SIGTERM');
        forceKillHandle = setTimeout(() => {
          if (!settled) {
            child.kill('SIGKILL');
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