/**
 * Readline helpers that manage interactive user prompts.
 *
 * Responsibilities:
 * - Expose a factory for the interactive readline interface used by the CLI.
 * - Provide a convenience wrapper that highlights prompts in the terminal.
 *
 * Consumers:
 * - `src/agent/loop.js` creates the interface and prompts users during command approvals.
 * - Tests mock these helpers through the root index re-exports.
 */

import * as readline from 'node:readline';
import chalk from 'chalk';

import openagentCore from '@asynkron/openagent-core';

export const ESCAPE_EVENT = 'openagent:escape';

type EscapeEventPayload = {
  reason: 'escape';
  timestamp: number;
};

type CancelFn = (reason?: string) => void;

const coreRuntime = openagentCore as unknown as { cancel?: CancelFn };

const cancelActive: CancelFn =
  coreRuntime && typeof coreRuntime.cancel === 'function'
    ? (reason?: string) => {
        coreRuntime.cancel?.(reason);
      }
    : () => {};

type InterfaceWithInput = readline.Interface & {
  input?: NodeJS.ReadStream;
};

function installEscapeListener(rl: readline.Interface): void {
  const { input } = rl as InterfaceWithInput;
  if (!input || typeof input.on !== 'function') {
    return;
  }

  const listeners: Array<() => void> = [];
  const addCleanup = (fn: () => void) => {
    if (typeof fn === 'function') {
      listeners.push(fn);
    }
  };

  const emitEscape = () => {
    cancelActive('esc-key');
    rl.emit(ESCAPE_EVENT, {
      reason: 'escape',
      timestamp: Date.now(),
    } satisfies EscapeEventPayload);
  };

  const handleCtrlC = (key: readline.Key | undefined) => {
    const handled = process.emit('SIGINT');
    if (!handled) {
      process.exit(0);
    }
    return key;
  };

  if (typeof input.setRawMode === 'function' && Boolean(input.isTTY)) {
    readline.emitKeypressEvents(input, rl);
    const wasRaw = Boolean(input.isRaw);
    if (!wasRaw) {
      input.setRawMode(true);
      addCleanup(() => {
        try {
          input.setRawMode(false);
        } catch (_err) {
          // Ignore raw mode restore failures.
        }
      });
    }

    const handleKeypress = (_str: string, key: readline.Key | undefined = undefined) => {
      if (!key) {
        return;
      }
      if (key.ctrl && key.name === 'c') {
        handleCtrlC(key);
        return;
      }
      if (key.name === 'escape' || key.sequence === '\u001b') {
        emitEscape();
      }
    };

    input.on('keypress', handleKeypress);
    addCleanup(() => {
      input.removeListener('keypress', handleKeypress);
    });
  } else {
    const handleData = (chunk: Buffer | string) => {
      if (!chunk) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buf.includes(0x1b)) {
        emitEscape();
      }
    };
    input.on('data', handleData);
    addCleanup(() => {
      input.removeListener('data', handleData);
    });
  }

  rl.once('close', () => {
    for (const fn of listeners.reverse()) {
      try {
        fn();
      } catch (_err) {
        // Ignore cleanup failures.
      }
    }
  });
}

export function createInterface(): readline.Interface {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
  });

  installEscapeListener(rl);

  return rl;
}

export async function askHuman(rl: readline.Interface, prompt: string): Promise<string> {
  const answer = await new Promise<string>((resolve) => {
    rl.question(chalk.bold.blue(prompt), (response: string) => {
      resolve(response);
    });
  });
  return String(answer).trim();
}

export default {
  createInterface,
  askHuman,
};
