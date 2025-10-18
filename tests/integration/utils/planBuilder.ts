// Utilities that keep CLI plan scaffolding consistent across integration tests.
import { queueModelResponse } from '../agentRuntimeTestHarness.js';

interface CommandDefaults {
  shell: string;
  cwd: string;
  timeoutSec: number;
}

interface PlanStepDefaults {
  title: string;
  fallbackRun: string;
}

interface CommandDefinition {
  shell: string;
  run: string;
  cwd: string;
  timeout_sec: number;
}

interface CommandOverride {
  shell?: string;
  run?: string;
  cwd?: string;
  timeout_sec?: number;
}

interface PlanStep {
  id: string;
  title: string;
  status: string;
  command: CommandDefinition;
  waitingForId?: string[];
}

interface PlanResponsePayload {
  message: string;
  plan: PlanStep[];
}

interface PlanBuilderConfig {
  gather: PlanStepDefaults;
  execute: PlanStepDefaults;
  commandDefaults: CommandDefaults;
  handshakeMessage: string;
  handshakeWaitingForId?: string[];
}

function withDefaultCommand(
  defaults: CommandDefaults,
  fallbackRun: string,
  commandOverride?: CommandOverride,
): CommandDefinition {
  const base: CommandDefinition = {
    shell: defaults.shell,
    run: fallbackRun,
    cwd: defaults.cwd,
    timeout_sec: defaults.timeoutSec,
  };

  if (!commandOverride) {
    return base;
  }

  return { ...base, ...commandOverride };
}

function createPlanSteps(
  config: PlanBuilderConfig,
  statusGather: string,
  statusExecute: string,
  commandOverride?: CommandOverride,
): PlanStep[] {
  const gatherStep: PlanStep = {
    id: 'plan-step-gather',
    title: config.gather.title,
    status: statusGather,
    command: withDefaultCommand(config.commandDefaults, config.gather.fallbackRun),
  };

  const executeStep: PlanStep = {
    id: 'plan-step-execute',
    title: config.execute.title,
    status: statusExecute,
    command: withDefaultCommand(
      config.commandDefaults,
      config.execute.fallbackRun,
      commandOverride,
    ),
  };

  return [gatherStep, executeStep];
}

export interface PlanBuilder {
  buildPlan: (
    statusGather: string,
    statusExecute: string,
    commandOverride?: CommandOverride,
  ) => PlanStep[];
  enqueueHandshake: () => void;
  enqueueFollowUp: (message: string, statusExecute: string) => void;
}

export function createPlanBuilder(config: PlanBuilderConfig): PlanBuilder {
  function buildPlan(
    statusGather: string,
    statusExecute: string,
    commandOverride?: CommandOverride,
  ): PlanStep[] {
    return createPlanSteps(config, statusGather, statusExecute, commandOverride).map((step) => ({
      ...step,
      command: { ...step.command },
      waitingForId: step.waitingForId ? [...step.waitingForId] : undefined,
    }));
  }

  function enqueueHandshake() {
    const plan = buildPlan('completed', 'pending');
    const waitingForId = config.handshakeWaitingForId ?? ['await-human'];
    plan[1].waitingForId = [...waitingForId];

    queueModelResponse({
      message: config.handshakeMessage,
      plan,
    });
  }

  function enqueueFollowUp(message: string, statusExecute: string) {
    const plan = buildPlan('completed', statusExecute);

    queueModelResponse({
      message,
      plan,
    });
  }

  return {
    buildPlan,
    enqueueHandshake,
    enqueueFollowUp,
  };
}

export type { CommandDefinition, CommandOverride, PlanResponsePayload, PlanStep };
