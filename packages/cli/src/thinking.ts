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

export function formatElapsedTime(
  startTime: number | null | undefined,
  now: number = Date.now(),
): string {
  if (!startTime || startTime > now) {
    return '00:00';
  }

  const elapsedMs = Math.max(0, now - startTime);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

const DEFAULT_FRAMES = ['⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠋'] as const;

type ThinkingIndicatorOptions = {
  stream?: NodeJS.WriteStream;
  frames?: readonly string[];
  label?: string;
  intervalMs?: number;
};

type IntervalHandle = ReturnType<typeof setInterval>;

export class ThinkingIndicator {
  private readonly stream: NodeJS.WriteStream;
  private readonly frames: readonly string[];
  private readonly label: string;
  private readonly intervalMs: number;
  private intervalHandle: IntervalHandle | null;
  private animationStart: number | null;
  private frameIndex: number;

  constructor({
    stream = process.stdout,
    frames = DEFAULT_FRAMES,
    label = ' Thinking',
    intervalMs = 50,
  }: ThinkingIndicatorOptions = {}) {
    this.stream = stream;
    this.frames = Array.isArray(frames) && frames.length > 0 ? frames : DEFAULT_FRAMES;
    this.label = label;
    this.intervalMs = Math.max(16, Number(intervalMs) || 50);

    this.intervalHandle = null;
    this.animationStart = null;
    this.frameIndex = 0;
  }

  isRunning(): boolean {
    return Boolean(this.intervalHandle);
  }

  start(): void {
    if (this.isRunning()) {
      return;
    }

    this.animationStart = Date.now();
    this.frameIndex = 0;

    try {
      this.stream.write('\n');
    } catch (_error) {
      // Ignore stream write failures silently.
    }

    this.intervalHandle = setInterval(() => {
      this.renderFrame();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.isRunning()) {
      return;
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.intervalHandle = null;
    this.animationStart = null;
    this.frameIndex = 0;

    try {
      readline.clearLine(this.stream, 0);
      readline.cursorTo(this.stream, 0);
    } catch (_error) {
      // Ignore TTY issues silently.
    }
  }

  private renderFrame(): void {
    if (!this.animationStart) {
      return;
    }

    const frame = this.frames[this.frameIndex % this.frames.length];
    const elapsed = formatElapsedTime(this.animationStart);

    try {
      readline.clearLine(this.stream, 0);
      readline.cursorTo(this.stream, 0);
      this.stream.write(chalk.dim(`${frame}${this.label} (${elapsed})`));
    } catch (_error) {
      // Ignore TTY issues silently.
    }

    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
  }
}

export const defaultIndicator = new ThinkingIndicator();

export function startThinking(): void {
  defaultIndicator.start();
}

export function stopThinking(): void {
  defaultIndicator.stop();
}

