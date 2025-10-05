'use strict';

/**
 * Handles the lightweight CLI "thinking" animation shown while awaiting API calls.
 *
 * Responsibilities:
 * - Render an animated status line with elapsed time.
 * - Clear the animation once work completes.
 *
 * Consumers:
 * - `src/agent/loop.js` invokes `startThinking()` before calling OpenAI and `stopThinking()` afterwards.
 * - Tests rely on the root re-exports to stub these behaviours.
 */

const readline = require('readline');
const chalk = require('chalk');

let intervalHandle = null;
let animationStart = null;

function formatElapsedTime(startTime, now = Date.now()) {
  if (!startTime || startTime > now) {
    return '00:00';
  }
  const elapsedMs = Math.max(0, now - startTime);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function startThinking() {
  if (intervalHandle) return;
  animationStart = Date.now();
  const frames = ['Thinking.  ', 'Thinking.. ', 'Thinking...'];
  let i = 0;
  process.stdout.write('\n');
  intervalHandle = setInterval(() => {
    try {
      const elapsed = formatElapsedTime(animationStart);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(chalk.dim(frames[i] + ' (' + elapsed + ')'));
      i = (i + 1) % frames.length;
    } catch (err) {
      // Ignore TTY issues silently.
    }
  }, 400);
}

function stopThinking() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    animationStart = null;
    try {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    } catch (err) {
      // Ignore TTY issues silently.
    }
  }
}

module.exports = {
  startThinking,
  stopThinking,
  formatElapsedTime,
};
