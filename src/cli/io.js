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

export function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
  });
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
