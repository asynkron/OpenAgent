import type { ToolCommand, ToolPlanStep } from '../../contracts/index.js';
import type { PlanStatus } from '../../utils/planStatusTypes.js';

type ToolPlanDependency = NonNullable<ToolPlanStep['waitingForId']>[number];
type ToolPlanIdentifier = ToolPlanStep['id'];

export type PlanCommand = Partial<ToolCommand> & {
  [key: string]: unknown;
};

export interface PlanEntry
  extends Partial<Omit<ToolPlanStep, 'id' | 'status' | 'waitingForId' | 'command'>> {
  id?: ToolPlanIdentifier | number;
  status: PlanStatus;
  waitingForId?: (ToolPlanDependency | number | string | null | undefined)[];
  command?: PlanCommand | null;
  priority?: number | string;
  [key: string]: unknown;
}

export type PlanEntries = PlanEntry[];
