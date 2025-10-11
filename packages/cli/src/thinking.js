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

import * as readline from 'node:readline';
import chalk from 'chalk';

export function formatElapsedTime(startTime, now = Date.now()) {
  if (!startTime || startTime > now) {
    return '00:00';
  }

  const elapsedMs = Math.max(0, now - startTime);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

const DEFAULT_FRAMES = ['⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠋'];

export class ThinkingIndicator {
  constructor({
    stream = process.stdout,
    frames = DEFAULT_FRAMES,
    label = ' Thinking',
    intervalMs = 50,
  } = {}) {
    this.stream = stream;
    this.frames = Array.isArray(frames) && frames.length > 0 ? frames : DEFAULT_FRAMES;
    this.label = label;
    this.intervalMs = Math.max(16, Number(intervalMs) || 50);

    this._intervalHandle = null;
    this._animationStart = null;
    this._frameIndex = 0;
  }

  isRunning() {
    return Boolean(this._intervalHandle);
  }

  start() {
    if (this.isRunning()) {
      return;
    }

    this._animationStart = Date.now();
    this._frameIndex = 0;

    try {
      this.stream.write('\n');
    } catch (error) {
      // Ignore stream write failures silently.
    }

    this._intervalHandle = setInterval(() => {
      this._renderFrame();
    }, this.intervalMs);
  }

  stop() {
    if (!this.isRunning()) {
      return;
    }

    clearInterval(this._intervalHandle);
    this._intervalHandle = null;
    this._animationStart = null;
    this._frameIndex = 0;

    try {
      readline.clearLine(this.stream, 0);
      readline.cursorTo(this.stream, 0);
    } catch (error) {
      // Ignore TTY issues silently.
    }
  }

  _renderFrame() {
    if (!this._animationStart) {
      return;
    }

    const frame = this.frames[this._frameIndex % this.frames.length];
    const elapsed = formatElapsedTime(this._animationStart);

    try {
      readline.clearLine(this.stream, 0);
      readline.cursorTo(this.stream, 0);
      this.stream.write(chalk.dim(`${frame}${this.label} (${elapsed})`));
    } catch (error) {
      // Ignore TTY issues silently.
    }

    this._frameIndex = (this._frameIndex + 1) % this.frames.length;
  }
}

export const defaultIndicator = new ThinkingIndicator();

export function startThinking() {
  defaultIndicator.start();
}

export function stopThinking() {
  defaultIndicator.stop();
}

export default {
  ThinkingIndicator,
  defaultIndicator,
  startThinking,
  stopThinking,
  formatElapsedTime,
};
