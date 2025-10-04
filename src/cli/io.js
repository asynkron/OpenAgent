"use strict";

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

const readline = require('readline');
const chalk = require('chalk');

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
  });
}

function askHuman(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(chalk.bold.blue(prompt), (answer) => {
      resolve(answer.trim());
    });
  });
}

module.exports = {
  createInterface,
  askHuman,
};
