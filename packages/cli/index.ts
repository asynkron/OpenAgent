// @ts-nocheck
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

const exported = {
  ...coreDefault,
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
  try {
    return import.meta.url;
  } catch {
    if (typeof __filename !== 'undefined') {
      return pathToFileURL(__filename).href;
    }
    return null;
  }
})();

if (moduleMetaUrl) {
  maybeRunCli(moduleMetaUrl, process.argv);
}
