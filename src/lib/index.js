/**
 * Aggregated library entry for the OpenAgent runtime.
 *
 * Responsibilities:
 * - Provide a CLI-agnostic export surface for package consumers.
 * - Re-export CLI utilities without entangling the runtime wiring logic.
 * - Surface helpers that the CLI runner can consume without forcing consumers to
 *   import CLI glue manually.
 */

import 'dotenv/config';

import { MODEL, getOpenAIClient, resetOpenAIClient } from '../openai/client.js';
import { startThinking, stopThinking, formatElapsedTime } from '../cli/thinking.js';
import { createInterface, askHuman, ESCAPE_EVENT } from '../cli/io.js';
import {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  renderPlanProgress,
} from '../cli/render.js';
import { renderRemainingContext } from '../cli/status.js';
import { runCommand, runRead, runApplyPatch } from '../commands/run.js';
import {
  CommandApprovalService,
  sessionApprovalService,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  commandSignature as __commandSignature,
  PREAPPROVED_CFG,
} from '../services/commandApprovalService.js';
import { applyFilter, tailLines, shellSplit } from '../utils/text.js';
import {
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from '../config/systemPrompt.js';
import { createAgentLoop, createAgentRuntime, extractResponseText } from '../agent/loop.js';
import { createWebSocketUi } from '../ui/websocket.js';
import {
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  startupFlagAccessors,
} from './startupFlags.js';
import { runCommandAndTrack, agentLoop } from '../cli/runtime.js';

export {
  MODEL,
  getOpenAIClient,
  resetOpenAIClient,
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
  runCommand,
  runRead,
  runApplyPatch,
  CommandApprovalService,
  sessionApprovalService,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  __commandSignature,
  PREAPPROVED_CFG,
  applyFilter,
  tailLines,
  shellSplit,
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  createAgentLoop,
  createAgentRuntime,
  extractResponseText,
  createWebSocketUi,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  runCommandAndTrack,
  agentLoop,
};

const exported = {
  ...startupFlagAccessors,
  MODEL,
  getOpenAIClient,
  resetOpenAIClient,
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
  runCommand,
  runRead,
  runApplyPatch,
  CommandApprovalService,
  sessionApprovalService,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  __commandSignature,
  PREAPPROVED_CFG,
  applyFilter,
  tailLines,
  shellSplit,
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  createAgentLoop,
  createAgentRuntime,
  extractResponseText,
  createWebSocketUi,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  runCommandAndTrack,
  agentLoop,
};

export default exported;
