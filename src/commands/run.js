/**
 * Hosts the side-effecting primitives that execute shell commands and exposes
 * higher-level helpers for browse, read, and string escaping operations.
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
import * as path from 'node:path';

import { register as registerCancellation } from '../utils/cancellation.js';

import { runBrowse } from './browse.js';
import { runRead } from './read.js';
import { runEscapeString, runUnescapeString } from './escapeString.js';

export async function runCommand(cmd, cwd, timeoutSec, shellOrOptions) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const isStringCommand = typeof cmd === 'string';

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

    let child;
    let stdout = '';
    let stderr = '';
    let killed = false;
    let canceled = false;
    let timedOut = false;
    let settled = false;
    let timeoutHandle;
    let forceKillHandle;

    const effectiveCloseStdin =
      closeStdin !== undefined ? Boolean(closeStdin) : stdin === undefined;

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
        const baseMarker = timedOut
          ? 'Command timed out and was terminated.'
          : 'Command was canceled.';
        finalStderr = appendLine(finalStderr, baseMarker);

        const detailMarker = detailFor(timedOut ? 'timeout' : 'canceled');
        if (detailMarker) {
          finalStderr = appendLine(finalStderr, detailMarker);
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
        const message =
          detailFor('canceled') ||
          (reason ? `Command was canceled: ${String(reason)}` : 'Command was canceled.');
        finalize({
          stdout: '',
          stderr: message,
          exit_code: null,
          killed: true,
          runtime_ms: Date.now() - startTime,
        });
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

    if (child.stdin) {
      if (stdin !== undefined) {
        try {
          child.stdin.write(stdin);
        } catch (err) {
          stderr = appendLine(stderr, err instanceof Error ? err.message : String(err));
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
      stderr = appendLine(stderr, message);
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

function normalizeStripValue(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('apply_patch.strip must be a non-negative integer.');
  }

  return parsed;
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

async function runApplyPatch(spec, cwd = '.', timeoutSec) {
  const start = Date.now();
  try {
    if (!spec || typeof spec !== 'object') {
      throw new Error('apply_patch spec must be an object.');
    }

    const target = ensureNonEmptyString(spec.target ?? spec.path ?? spec.file, 'apply_patch target');
    const patchSource = spec.patch ?? spec.patch_text ?? spec.patchText ?? spec.diff;

    if (patchSource === undefined || patchSource === null) {
      throw new Error('apply_patch patch must be provided.');
    }

    const patchText =
      typeof patchSource === 'string'
        ? patchSource
        : patchSource instanceof Buffer
          ? patchSource.toString('utf8')
          : String(patchSource);

    if (!patchText.trim()) {
      throw new Error('apply_patch patch must be a non-empty string.');
    }

    const args = ['git', 'apply'];

    const stripValue = normalizeStripValue(spec.strip ?? spec.p);
    if (typeof stripValue === 'number') {
      args.push(`-p${stripValue}`);
    }

    const whitespaceMode = spec.whitespace ? ensureNonEmptyString(spec.whitespace, 'apply_patch.whitespace') : null;
    args.push(`--whitespace=${whitespaceMode || 'nowarn'}`);

    if (spec.reverse) {
      args.push('--reverse');
    }

    if (spec.allow_empty || spec.allowEmpty) {
      args.push('--allow-empty');
    }

    args.push('-');

    const commandLabel = `git apply ${target}`.trim();

    const result = await runCommand(args, cwd, timeoutSec, {
      stdin: patchText,
      closeStdin: true,
      commandLabel,
      description: `apply_patch: ${target}`,
    });

    if (result.exit_code === 0) {
      const absTarget = path.resolve(cwd || '.', target);
      const relativeTarget = path.relative(process.cwd(), absTarget) || target;
      const successMessage = `Applied patch to ${relativeTarget}`;
      const stdout = result.stdout && result.stdout.trim() ? `${result.stdout}\n${successMessage}` : successMessage;
      return { ...result, stdout };
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: '',
      stderr: message,
      exit_code: 1,
      killed: false,
      runtime_ms: Date.now() - start,
    };
  }
}

export { runBrowse, runRead, runEscapeString, runUnescapeString, runApplyPatch };

export default {
  runCommand,
  runBrowse,
  runRead,
  runEscapeString,
  runUnescapeString,
  runApplyPatch,
};
