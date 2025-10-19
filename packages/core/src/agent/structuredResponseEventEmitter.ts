import type { CommandDraft, PlanObservation, PlanResponse, PlanStep } from '../contracts/index.js';
import type { PlanResponseStreamPartial } from '../openai/responses.js';
import type {
  CommandDraftStreamPartial,
  PlanStepStreamPartial,
} from '../openai/responses/structuredResult.js';
import {
  clonePlanTree,
  type PlanSnapshot,
  type PlanSnapshotStep,
} from '../utils/planCloneUtils.js';
import { emitAssistantMessageEvent, type EmitRuntimeEvent } from './assistantMessageEmitter.js';
import type { RuntimeEvent } from './runtimeTypes.js';

export interface StructuredResponseEmissionSummary {
  readonly messageEmitted: boolean;
  readonly planEmitted: boolean;
}

interface StructuredResponseEventEmitterOptions {
  readonly emitEvent?: EmitRuntimeEvent | null;
}

const cloneCommandDraft = (
  value: CommandDraft | CommandDraftStreamPartial | null | undefined,
): CommandDraft | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const command: CommandDraft = {};

  if (typeof value.reason === 'string') {
    command.reason = value.reason;
  }
  if (typeof value.shell === 'string') {
    command.shell = value.shell;
  }
  if (typeof value.run === 'string') {
    command.run = value.run;
  }
  if (typeof value.cwd === 'string') {
    command.cwd = value.cwd;
  }
  if (typeof value.timeout_sec === 'number' && Number.isFinite(value.timeout_sec)) {
    command.timeout_sec = value.timeout_sec;
  }
  if (typeof value.filter_regex === 'string') {
    command.filter_regex = value.filter_regex;
  }
  if (typeof value.tail_lines === 'number' && Number.isFinite(value.tail_lines)) {
    command.tail_lines = value.tail_lines;
  }
  if (typeof value.max_bytes === 'number' && Number.isFinite(value.max_bytes)) {
    command.max_bytes = value.max_bytes;
  }

  return command;
};

const cloneObservation = (
  value: PlanObservation | null | undefined,
): PlanObservation | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as PlanObservation;
  } catch (_error) {
    return value;
  }
};

const cloneWaitingForIds = (
  value:
    | PlanStep['waitingForId']
    | PlanStepStreamPartial['waitingForId']
    | PlanSnapshotStep['waitingForId'],
): PlanSnapshotStep['waitingForId'] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const cloned: Array<string | number> = [];
  for (const entry of value) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      cloned.push(entry);
    }
  }
  return cloned.length > 0 ? cloned : [];
};

const clonePlanSnapshotStep = (step: PlanSnapshotStep): PlanSnapshotStep => {
  const cloned: PlanSnapshotStep = {};

  if (step.id !== undefined) {
    cloned.id = step.id;
  }
  if (typeof step.title === 'string') {
    cloned.title = step.title;
  }
  if (typeof step.status === 'string') {
    cloned.status = step.status;
  }
  if (Array.isArray(step.waitingForId)) {
    const waiting = cloneWaitingForIds(step.waitingForId);
    if (waiting !== undefined) {
      cloned.waitingForId = waiting;
    }
  }
  if (step.command !== undefined) {
    cloned.command = cloneCommandDraft(step.command ?? undefined) ?? undefined;
  }
  if (step.observation !== undefined) {
    cloned.observation = cloneObservation(step.observation) ?? null;
  }
  if (step.priority !== undefined) {
    cloned.priority = step.priority;
  }

  return cloned;
};

const hasPlanSnapshotContent = (step: PlanSnapshotStep): boolean => {
  return (
    step.id !== undefined ||
    step.title !== undefined ||
    step.status !== undefined ||
    step.waitingForId !== undefined ||
    step.command !== undefined ||
    step.observation !== undefined ||
    step.priority !== undefined
  );
};

const mergePlanSnapshotStep = (
  existing: PlanSnapshotStep | undefined,
  incoming: PlanSnapshotStep,
): PlanSnapshotStep => {
  const merged = existing ? clonePlanSnapshotStep(existing) : ({} as PlanSnapshotStep);

  if (incoming.id !== undefined) {
    merged.id = incoming.id;
  }
  if (typeof incoming.title === 'string') {
    merged.title = incoming.title;
  }
  if (typeof incoming.status === 'string') {
    merged.status = incoming.status;
  }
  if (Array.isArray(incoming.waitingForId)) {
    const waiting = cloneWaitingForIds(incoming.waitingForId);
    if (waiting !== undefined) {
      merged.waitingForId = waiting;
    }
  }
  if (incoming.command !== undefined) {
    merged.command = cloneCommandDraft(incoming.command ?? undefined) ?? undefined;
  }
  if (incoming.observation !== undefined) {
    merged.observation = cloneObservation(incoming.observation) ?? null;
  }
  if (incoming.priority !== undefined) {
    merged.priority = incoming.priority;
  }

  return merged;
};

const buildSnapshotFromStreamPartial = (
  partial: PlanStepStreamPartial,
): PlanSnapshotStep => {
  const snapshot: PlanSnapshotStep = {};

  if (typeof partial.id === 'string' || typeof partial.id === 'number') {
    snapshot.id = partial.id;
  }
  if (typeof partial.title === 'string') {
    snapshot.title = partial.title;
  }
  if (typeof partial.status === 'string') {
    snapshot.status = partial.status;
  }
  if (Array.isArray(partial.waitingForId)) {
    const waiting = cloneWaitingForIds(partial.waitingForId);
    if (waiting !== undefined) {
      snapshot.waitingForId = waiting;
    }
  }
  if (partial.command === null) {
    snapshot.command = null;
  } else if (partial.command && typeof partial.command === 'object') {
    snapshot.command = cloneCommandDraft(partial.command) ?? undefined;
  }
  if (partial.observation) {
    snapshot.observation = cloneObservation(partial.observation) ?? null;
  }
  if (
    partial.priority !== undefined &&
    (typeof partial.priority === 'number' || typeof partial.priority === 'string')
  ) {
    snapshot.priority = partial.priority;
  }

  return snapshot;
};

const buildSnapshotFromPlanStep = (step: PlanStep): PlanSnapshotStep => {
  const snapshot: PlanSnapshotStep = {
    id: step.id,
    title: step.title,
    status: step.status,
  };

  if (Array.isArray(step.waitingForId)) {
    const waiting = cloneWaitingForIds(step.waitingForId);
    if (waiting !== undefined) {
      snapshot.waitingForId = waiting;
    }
  }
  if (step.command !== undefined) {
    snapshot.command = cloneCommandDraft(step.command) ?? undefined;
  }
  if (step.observation !== undefined) {
    snapshot.observation = cloneObservation(step.observation) ?? null;
  }
  if (step.priority !== undefined && step.priority !== null) {
    snapshot.priority = step.priority;
  }

  return snapshot;
};

const serializePlan = (plan: PlanSnapshotStep[]): string => {
  if (plan.length === 0) {
    return '[]';
  }
  return JSON.stringify(plan);
};

const emptySummary: StructuredResponseEmissionSummary = {
  messageEmitted: false,
  planEmitted: false,
};

export class StructuredResponseEventEmitter {
  private readonly emitEvent: EmitRuntimeEvent | null;

  private streamingPlan: PlanSnapshotStep[] = [];

  private finalPlan: PlanSnapshotStep[] = [];

  private lastStreamingPlanSignature: string | null = null;

  private lastFinalPlanSignature: string | null = null;

  private lastMessageSignature: string | null = null;

  private hasEmittedMessage = false;

  private planningActive = false;

  constructor(options: StructuredResponseEventEmitterOptions) {
    this.emitEvent = options.emitEvent ?? null;
  }

  handleStreamPartial(partial: PlanResponseStreamPartial | null | undefined): StructuredResponseEmissionSummary {
    if (!partial || typeof partial !== 'object') {
      return emptySummary;
    }

    if (typeof partial.message === 'string') {
      this.applyMessageUpdate(partial.message);
    }

    let planEmitted = false;

    if ('plan' in partial) {
      const planChanged = this.mergeStreamingPlanSnapshot(
        partial.plan === null
          ? null
          : Array.isArray(partial.plan)
          ? partial.plan.map((step) => buildSnapshotFromStreamPartial(step))
          : undefined,
      );
      if (planChanged) {
        planEmitted = this.emitStreamingPlanSnapshot();
      }
    }

    return {
      messageEmitted: this.hasEmittedMessage,
      planEmitted,
    };
  }

  handleFinalResponse(response: PlanResponse): StructuredResponseEmissionSummary {
    this.applyMessageUpdate(response.message);
    const finalPlanSnapshot = response.plan.map((step) => buildSnapshotFromPlanStep(step));
    const planChanged = this.replaceFinalPlanSnapshot(finalPlanSnapshot);
    const planEmitted = planChanged ? this.emitFinalPlanSnapshot() : false;

    if (this.streamingPlan.length > 0 || this.lastStreamingPlanSignature !== null) {
      this.streamingPlan = [];
      this.lastStreamingPlanSignature = null;
    }

    if (!planEmitted && this.planningActive) {
      this.planningActive = false;
      this.emitPlanningEvent('finish');
    }

    return {
      messageEmitted: this.hasEmittedMessage,
      planEmitted,
    };
  }

  private applyMessageUpdate(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    if (this.lastMessageSignature === trimmed) {
      return false;
    }

    this.lastMessageSignature = trimmed;

    if (!this.emitEvent) {
      return false;
    }

    emitAssistantMessageEvent(this.emitEvent, trimmed);
    this.hasEmittedMessage = true;
    return true;
  }

  private mergeStreamingPlanSnapshot(plan: PlanSnapshotStep[] | null | undefined): boolean {
    if (plan === undefined) {
      return false;
    }

    if (plan === null) {
      if (this.streamingPlan.length === 0) {
        return false;
      }
      this.streamingPlan = [];
      this.lastStreamingPlanSignature = null;
      if (this.planningActive) {
        this.planningActive = false;
        this.emitPlanningEvent('finish');
      }
      return true;
    }

    const merged: PlanSnapshotStep[] = [];

    for (let index = 0; index < plan.length; index += 1) {
      const incoming = plan[index];
      if (!incoming) {
        continue;
      }
      const existing = index < this.streamingPlan.length ? this.streamingPlan[index] : undefined;
      const mergedStep = mergePlanSnapshotStep(existing, incoming);
      if (hasPlanSnapshotContent(mergedStep)) {
        merged.push(mergedStep);
      }
    }

    return this.replaceStreamingPlanSnapshot(merged);
  }

  private replaceStreamingPlanSnapshot(plan: PlanSnapshotStep[]): boolean {
    const serializedNext = serializePlan(plan);
    const serializedCurrent = serializePlan(this.streamingPlan);

    if (serializedNext === serializedCurrent) {
      return false;
    }

    this.streamingPlan = plan;
    this.lastStreamingPlanSignature = null;
    return true;
  }

  private replaceFinalPlanSnapshot(plan: PlanSnapshotStep[]): boolean {
    const serializedNext = serializePlan(plan);
    const serializedCurrent = serializePlan(this.finalPlan);

    if (serializedNext === serializedCurrent) {
      return false;
    }

    this.finalPlan = plan;
    return true;
  }

  private emitStreamingPlanSnapshot(): boolean {
    if (!this.emitEvent) {
      return false;
    }

    const snapshot: PlanSnapshot = clonePlanTree(this.streamingPlan);
    const serialized = serializePlan(snapshot);

    if (this.lastStreamingPlanSignature === serialized) {
      return false;
    }

    this.lastStreamingPlanSignature = serialized;

    const state = this.planningActive ? 'update' : 'start';
    this.planningActive = true;
    this.emitPlanningEvent(state);
    return true;
  }

  private emitFinalPlanSnapshot(): boolean {
    if (!this.emitEvent) {
      return false;
    }

    const snapshot: PlanSnapshot = clonePlanTree(this.finalPlan);
    const serialized = serializePlan(snapshot);

    if (this.lastFinalPlanSignature === serialized) {
      return false;
    }

    this.lastFinalPlanSignature = serialized;

    const event: RuntimeEvent = {
      type: 'plan',
      payload: {
        plan: snapshot,
      },
      plan: snapshot,
    } as RuntimeEvent;

    this.emitEvent(event);
    if (this.planningActive) {
      this.planningActive = false;
      this.emitPlanningEvent('finish');
    }
    return true;
  }

  private emitPlanningEvent(state: 'start' | 'update' | 'finish'): void {
    if (!this.emitEvent) {
      return;
    }

    const event: RuntimeEvent = {
      type: 'planning',
      payload: {
        state,
      },
    } as RuntimeEvent;

    this.emitEvent(event);
  }
}

export const createStructuredResponseEventEmitter = (
  options: StructuredResponseEventEmitterOptions,
): StructuredResponseEventEmitter => new StructuredResponseEventEmitter(options);
