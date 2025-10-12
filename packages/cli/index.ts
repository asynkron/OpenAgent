/**
 * Public entry point for the OpenAgent CLI package.
 *
 * Responsibilities:
 * - Re-export the reusable core runtime so existing consumers keep working.
 * - Surface CLI helpers (Ink renderers, readline wrappers, runtime loop).
 * - Invoke the CLI automatically when the module itself is executed directly.
 */

import { pathToFileURL } from 'node:url';

import coreDefault from '@asynkron/openagent-core';

import { startThinking, stopThinking, formatElapsedTime } from './src/thinking.js';
import { createInterface, askHuman, ESCAPE_EVENT } from './src/io.js';
import {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  renderPlanProgress,
} from './src/render.js';
import { renderRemainingContext } from './src/status.js';
import { runCommandAndTrack, agentLoop } from './src/runtime.js';
import { runCli, maybeRunCli } from './src/runner.js';

export * from '@asynkron/openagent-core';

type CliHelpers = {
  startThinking: typeof startThinking;
  stopThinking: typeof stopThinking;
  formatElapsedTime: typeof formatElapsedTime;
  createInterface: typeof createInterface;
  askHuman: typeof askHuman;
  ESCAPE_EVENT: typeof ESCAPE_EVENT;
  display: typeof display;
  wrapStructuredContent: typeof wrapStructuredContent;
  renderMarkdownMessage: typeof renderMarkdownMessage;
  renderPlan: typeof renderPlan;
  renderMessage: typeof renderMessage;
  renderCommand: typeof renderCommand;
  renderPlanProgress: typeof renderPlanProgress;
  renderRemainingContext: typeof renderRemainingContext;
  runCommandAndTrack: typeof runCommandAndTrack;
  agentLoop: typeof agentLoop;
  runCli: typeof runCli;
  maybeRunCli: typeof maybeRunCli;
};

export {
  startThinking,
  stopThinking,
  formatElapsedTime,
  createInterface,
  askHuman,
  ESCAPE_EVENT,
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  renderPlanProgress,
  renderRemainingContext,
  runCommandAndTrack,
  agentLoop,
  runCli,
  maybeRunCli,
};

const exported: typeof coreDefault & CliHelpers = {
  ...(coreDefault as typeof coreDefault),
  startThinking,
  stopThinking,
  formatElapsedTime,
  createInterface,
  askHuman,
  ESCAPE_EVENT,
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  renderPlanProgress,
  renderRemainingContext,
  runCommandAndTrack,
  agentLoop,
  runCli,
  maybeRunCli,
};

export default exported;

const moduleMetaUrl = (() => {
  if (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string') {
    return import.meta.url;
  }

  if (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1]) {
    return pathToFileURL(process.argv[1]).href;
  }

  return null;
})();

if (moduleMetaUrl) {
  maybeRunCli(moduleMetaUrl, process.argv);
}
