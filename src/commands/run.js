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
    const proc = spawn(cmd, { cwd, shell: shellOpt ?? true });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      killed = true;
    }, timeoutSec * 1000);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exit_code: code,
        killed,
        runtime_ms: Date.now() - startTime,
      });
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
