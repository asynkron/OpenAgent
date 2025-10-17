import { mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCRATCH_ROOT = resolve('.openagent', 'temp');

export interface TempOutputs {
  tempDir: string;
  stdoutPath: string;
  stderrPath: string;
  stdoutFd: number;
  stderrFd: number;
}

export const prepareTempOutputs = (): TempOutputs => {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const tempDir = mkdtempSync(join(SCRATCH_ROOT, 'cmd-'));
  const stdoutPath = join(tempDir, 'stdout.log');
  const stderrPath = join(tempDir, 'stderr.log');
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');
  return { tempDir, stdoutPath, stderrPath, stdoutFd, stderrFd };
};

export const safeClose = (fd: number): void => {
  try {
    closeSync(fd);
  } catch {
    // Ignore close errors.
  }
};

export const safeReadFile = (path: string | undefined): string => {
  if (!path) {
    return '';
  }
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to read command output: ${message}`;
  }
};

export const cleanupTempDir = (tempDir: string | undefined): void => {
  if (!tempDir) {
    return;
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors.
  }
};
