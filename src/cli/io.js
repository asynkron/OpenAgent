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

import readline from 'node:readline';
import chalk from 'chalk';

import { cancel as cancelActive } from '../utils/cancellation.js';

export const ESCAPE_EVENT = 'openagent:escape';

function installEscapeListener(rl) {
  const input = rl?.input;
  if (!input || typeof input.on !== 'function') {
    return;
  }

  const listeners = [];
  const addCleanup = (fn) => {
    if (typeof fn === 'function') {
      listeners.push(fn);
    }
  };

  const emitEscape = () => {
    cancelActive('esc-key');
    rl.emit(ESCAPE_EVENT, {
      reason: 'escape',
      timestamp: Date.now(),
    });
  };

  const handleCtrlC = (key) => {
    const handled = process.emit('SIGINT');
    if (!handled) {
      process.exit(0);
    }
    return key;
  };

  if (typeof input.setRawMode === 'function' && input.isTTY) {
    readline.emitKeypressEvents(input, rl);
    const wasRaw = input.isRaw;
    if (!wasRaw) {
      input.setRawMode(true);
      addCleanup(() => {
        try {
          input.setRawMode(false);
        } catch (err) {
          // Ignore raw mode restore failures.
        }
      });
    }

    const handleKeypress = (_str, key = {}) => {
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
    const handleData = (chunk) => {
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
      } catch (err) {
        // Ignore cleanup failures.
      }
    }
  });
}

export function createInterface() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
  });

  installEscapeListener(rl);

  return rl;
}

export async function askHuman(rl, prompt) {
  const answer = await new Promise((resolve) => {
    rl.question(chalk.bold.blue(prompt), (response) => {
      resolve(response);
    });
  });
  return String(answer).trim();
}

export default {
  createInterface,
  askHuman,
};
