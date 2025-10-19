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
import { PlanStatus, TERMINAL_PLAN_STATUSES } from '../contracts/index.js';
import { isTerminalStatus } from '../agent/passExecutor/planStepStatus.js';
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
  PlanStatus,
  TERMINAL_PLAN_STATUSES,
  isTerminalStatus,
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
export type { PromptRequestMetadata, PromptRequestScope } from '../agent/promptCoordinator.js';
export type {
  AssistantMessageRuntimeEvent,
  BannerRuntimeEvent,
  CommandResultRuntimeEvent,
  ContextUsageRuntimeEvent,
  DebugRuntimeEvent,
  DebugRuntimeEventPayload,
  ErrorRuntimeEvent,
  PlanningRuntimeEvent,
  PassRuntimeEvent,
  PlanProgressRuntimeEvent,
  PlanRuntimeEvent,
  RequestInputRuntimeEvent,
  RuntimeEvent,
  RuntimeEventBase,
  RuntimeEventObserver,
  SchemaValidationFailedRuntimeEvent,
  StatusLevel,
  StatusRuntimeEvent,
  ThinkingRuntimeEvent,
  ThinkingState,
  AgentRuntimeOptions,
} from '../agent/runtimeTypes.js';
export type { PlanHistorySnapshot } from '../agent/passExecutor/planSnapshot.js';
export type { ChatMessageEntry } from '../contracts/index.js';
export type { CommandResult } from '../commands/run.js';
export type { ContextUsageSummary } from '../utils/contextUsage.js';

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
  PlanStatus,
  TERMINAL_PLAN_STATUSES,
  isTerminalStatus,
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
