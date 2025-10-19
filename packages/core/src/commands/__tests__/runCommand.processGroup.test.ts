import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { jest } from '@jest/globals';

const WAIT_INTERVAL_MS = 50;
const DEFAULT_TIMEOUT_MS = 5000;

function writeSpawnerScript(targetDir: string): string {
  const scriptPath = path.join(targetDir, 'spawn-child.cjs');
  const scriptSource = [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    "const { join } = require('node:path');",
    '',
    'const child = spawn(process.execPath, [\'-e\', \"setInterval(() => {}, 1000);\"], { stdio: \"ignore\" });',
    "writeFileSync(join(process.cwd(), 'child-pid.txt'), String(child.pid));",
    '',
    '// Keep the parent process alive until the test cancels the command.',
    'setInterval(() => {}, 1000);',
    '',
  ].join('\n');

  fs.writeFileSync(scriptPath, scriptSource, { encoding: 'utf8' });
  return scriptPath;
}

async function waitForFile(filePath: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await delay(WAIT_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function readChildPid(filePath: string): number {
  const pidContent = fs.readFileSync(filePath, { encoding: 'utf8' }).trim();
  const parsed = Number.parseInt(pidContent, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid child PID recorded in ${filePath}: ${pidContent}`);
  }
  return parsed;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException;
    if (typedError && typedError.code === 'ESRCH') {
      return false;
    }
    if (typedError && typedError.code === 'EPERM') {
      return true;
    }
    throw error;
  }
  const statusPath = `/proc/${pid}/status`;
  if (fs.existsSync(statusPath)) {
    try {
      const statusContent = fs.readFileSync(statusPath, { encoding: 'utf8' });
      if (statusContent.includes('State:\tZ') || statusContent.includes('State:  Z')) {
        return false;
      }
    } catch {
      // Ignore read errors; fall back to treating the process as alive.
    }
  }
  return true;
}

async function waitForProcessExit(pid: number, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await delay(WAIT_INTERVAL_MS);
  }
  throw new Error(`Process ${pid} did not exit within ${timeoutMs}ms`);
}

describe('runCommand process group cancellation', () => {
  jest.setTimeout(20000);

  test('ESC cancellation terminates descendant processes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-command-pg-'));
    const pidFilePath = path.join(tmpDir, 'child-pid.txt');
    let childPid = 0;

    try {
      const scriptPath = writeSpawnerScript(tmpDir);
      const quotedNode = JSON.stringify(process.execPath);
      const quotedScript = JSON.stringify(path.basename(scriptPath));
      const command = `${quotedNode} ${quotedScript}`;

      const { runCommand } = await import('../run.js');
      const { cancel } = await import('../../utils/cancellation.js');

      const commandPromise = runCommand(command, tmpDir, 10);

      await waitForFile(pidFilePath);
      childPid = readChildPid(pidFilePath);
      expect(childPid).toBeGreaterThan(0);
      expect(isProcessAlive(childPid)).toBe(true);

      cancel('esc-test');

      const result = await commandPromise;
      expect(result.killed).toBe(true);
      expect(result.exit_code).toBeNull();
      expect(result.stderr).toContain('Command was canceled');

      await waitForProcessExit(childPid);
      expect(isProcessAlive(childPid)).toBe(false);
    } finally {
      if (childPid > 0 && isProcessAlive(childPid)) {
        try {
          process.kill(childPid, 'SIGKILL');
        } catch {
          // Ignore cleanup errors; the test already failed if the child survived.
        }
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
