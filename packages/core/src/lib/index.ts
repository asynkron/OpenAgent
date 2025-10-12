// @ts-nocheck
/**
 * Aggregated library entry for the OpenAgent core runtime.
 *
 * Responsibilities:
 * - Provide a CLI-agnostic export surface for package consumers.
 * - Surface the orchestration loop, configuration helpers, and shared utilities
 *   used by higher level interfaces like the CLI or WebSocket bindings.
 */

import 'dotenv/config';

import { MODEL, getOpenAIClient, resetOpenAIClient } from '../openai/client.js';
import { runCommand } from '../commands/run.js';
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
import { incrementCommandCount } from '../services/commandStatsService.js';
import { applyFilter, tailLines, shellSplit } from '../utils/text.js';
import {
  register as registerCancellation,
  cancel,
  isCanceled,
  getActiveOperation,
} from '../utils/cancellation.js';
import {
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from '../config/systemPrompt.js';
import {
  createAgentLoop,
  createAgentRuntime,
  extractOpenAgentToolCall,
  extractResponseText,
} from '../agent/loop.js';
import { createWebSocketBinding } from '../bindings/websocket.js';
import {
  getStartupFlags,
  getAutoApproveFlag,
  getNoHumanFlag,
  getPlanMergeFlag,
  getDebugFlag,
  setNoHumanFlag,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  startupFlagAccessors,
} from './startupFlags.js';

export {
  MODEL,
  getOpenAIClient,
  resetOpenAIClient,
  runCommand,
  CommandApprovalService,
  sessionApprovalService,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  __commandSignature,
  PREAPPROVED_CFG,
  incrementCommandCount,
  applyFilter,
  tailLines,
  shellSplit,
  registerCancellation,
  cancel,
  isCanceled,
  getActiveOperation,
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  createAgentLoop,
  createAgentRuntime,
  extractOpenAgentToolCall,
  extractResponseText,
  createWebSocketBinding,
  getStartupFlags,
  getAutoApproveFlag,
  getNoHumanFlag,
  getPlanMergeFlag,
  getDebugFlag,
  setNoHumanFlag,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  startupFlagAccessors,
};

const exported = {
  ...startupFlagAccessors,
  MODEL,
  getOpenAIClient,
  resetOpenAIClient,
  runCommand,
  CommandApprovalService,
  sessionApprovalService,
  loadPreapprovedConfig,
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  resetSessionApprovals,
  __commandSignature,
  PREAPPROVED_CFG,
  incrementCommandCount,
  applyFilter,
  tailLines,
  shellSplit,
  registerCancellation,
  cancel,
  isCanceled,
  getActiveOperation,
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  createAgentLoop,
  createAgentRuntime,
  extractOpenAgentToolCall,
  extractResponseText,
  createWebSocketBinding,
  getStartupFlags,
  getAutoApproveFlag,
  getNoHumanFlag,
  getPlanMergeFlag,
  getDebugFlag,
  setNoHumanFlag,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
};

export default exported;
