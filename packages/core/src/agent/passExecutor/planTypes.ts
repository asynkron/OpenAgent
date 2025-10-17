import { ToolResponseSchema, type ToolCommand, type ToolPlanStep, type ToolResponse } from '../../contracts/index.js';
import { PENDING_STATUS, type PlanStatus } from '../../utils/planStatusTypes.js';

type ToolPlanDependency = NonNullable<ToolPlanStep['waitingForId']>[number];
type ToolPlanIdentifier = ToolPlanStep['id'];

export interface PlanCommand extends Partial<ToolCommand>, Record<string, unknown> {
  key?: string;
}

export interface PlanSnapshotStep
  extends Partial<Omit<ToolPlanStep, 'id' | 'status' | 'waitingForId' | 'command'>> {
  id?: ToolPlanIdentifier | number;
  status: PlanStatus;
  waitingForId?: (ToolPlanDependency | number | string | null | undefined)[];
  command?: PlanCommand | null;
  priority?: number | string;
  step?: string | number;
}

export type PlanEntry = PlanSnapshotStep;
export type PlanEntries = PlanEntry[];
export type PlanSnapshot = PlanSnapshotStep[];

export type ParsedToolPlan = ToolPlanStep[];
export type ParsedToolResponse = ToolResponse;

export const parseToolPlanResponse = (input: unknown): ParsedToolResponse =>
  ToolResponseSchema.parse(input);

export const createPlanCommand = (overrides: Partial<PlanCommand> = {}): PlanCommand => ({
  ...overrides,
});

export const createPlanSnapshotStep = (overrides: Partial<PlanSnapshotStep> = {}): PlanSnapshotStep => {
  const {
    id = 'step-1',
    status = PENDING_STATUS,
    waitingForId = [],
    command,
    priority,
    observation,
    ...rest
  } = overrides;

  const snapshot: PlanSnapshotStep = {
    status,
    waitingForId: [...waitingForId],
    ...(priority !== undefined ? { priority } : {}),
    ...(observation !== undefined ? { observation } : {}),
    ...rest,
  };

  if (command !== undefined) {
    snapshot.command = command;
  }

  if (id !== undefined) {
    snapshot.id = id;
  }

  return snapshot;
};
