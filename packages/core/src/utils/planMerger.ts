import type { PlanSnapshot, PlanSnapshotStep } from './planCloneUtils.js';
import { deepCloneValue } from './planCloneUtils.js';
import {
  isAbandonedStatus,
  isCompletedStatus,
  isFailedStatus,
  isTerminalStatus,
} from './planStatusUtils.js';
import { PENDING_STATUS, normalizePlanStatus } from './planStatusTypes.js';
import { commandsAreEqual } from './planComparisonUtils.js';

// Guard helper that makes sure plan snapshots never carry unexpected status
// literals. Incoming plans can originate from assistant responses or custom
// persistence layers, so we coerce any unknown values back to the canonical
// PlanStatus union before merging.
const normalizePlanSnapshotStepStatus = (
  step: PlanSnapshotStep | null | undefined,
): void => {
  if (!step || typeof step !== 'object') {
    return;
  }

  const normalized = normalizePlanStatus(step.status);
  step.status = normalized ?? PENDING_STATUS;
};

const normalizePlanSnapshotStatuses = (plan: PlanSnapshot | null | undefined): void => {
  if (!Array.isArray(plan)) {
    return;
  }

  plan.forEach((step) => normalizePlanSnapshotStepStatus(step));
};
type IdentifierCandidate =
  | PlanSnapshotStep['id']
  | (PlanSnapshotStep['waitingForId'] extends Array<infer U> ? U : never)
  | null
  | undefined;

function normalizePlanIdentifier(value: PlanSnapshotStep['id']): string;
function normalizePlanIdentifier(value: IdentifierCandidate): string;
function normalizePlanIdentifier(value: IdentifierCandidate): string {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value).trim();
  return normalized || '';
}

const createPlanKey = (item: PlanSnapshotStep | null | undefined, fallbackIndex: number): string => {
  if (!item || typeof item !== 'object') {
    return `index:${fallbackIndex}`;
  }

  const id = normalizePlanIdentifier(item.id);
  if (id) {
    return `id:${id.toLowerCase()}`;
  }

  if (typeof item.title === 'string' && item.title.trim().length > 0) {
    return `title:${item.title.trim().toLowerCase()}`;
  }

  return `index:${fallbackIndex}`;
};

const mergePlanItems = (
  existingItem: PlanSnapshotStep,
  incomingItem: PlanSnapshotStep,
): PlanSnapshotStep | null => {
  if (!existingItem || typeof existingItem !== 'object') {
    return deepCloneValue(incomingItem);
  }

  if (!incomingItem || typeof incomingItem !== 'object') {
    return existingItem;
  }

  if (isAbandonedStatus(incomingItem.status)) {
    return null;
  }

  const dependencies = Array.isArray(incomingItem.waitingForId)
    ? deepCloneValue(incomingItem.waitingForId)
    : [];
  existingItem.waitingForId = dependencies;

  const incomingCommand = incomingItem.command;
  const incomingStatus = incomingItem.status;
  const allowCommandUpdate = !isCompletedStatus(incomingStatus);

  if (allowCommandUpdate && incomingCommand && typeof incomingCommand === 'object') {
    const existingCommand = existingItem.command;
    const commandChanged =
      !existingCommand ||
      typeof existingCommand !== 'object' ||
      !commandsAreEqual(existingCommand, incomingCommand);

    if (commandChanged) {
      existingItem.command = deepCloneValue(incomingCommand);

      const incomingIsTerminal =
        isTerminalStatus(incomingStatus) || isAbandonedStatus(incomingStatus);
      const shouldResetStatus =
        isFailedStatus(existingItem.status) ||
        (isAbandonedStatus(existingItem.status) && !incomingIsTerminal);

      if (shouldResetStatus) {
        existingItem.status = PENDING_STATUS;
      }
    }
  }

  return existingItem;
};

export const mergePlanTrees = (
  existingPlan: PlanSnapshot | null | undefined = [],
  incomingPlan: PlanSnapshot | null | undefined = [],
): PlanSnapshot => {
  const existing: PlanSnapshot = Array.isArray(existingPlan) ? existingPlan : [];
  const incoming: PlanSnapshot = Array.isArray(incomingPlan) ? incomingPlan : [];

  normalizePlanSnapshotStatuses(existing);
  normalizePlanSnapshotStatuses(incoming);

  if (incoming.length === 0) {
    return [];
  }

  const existingIndex = new Map<string, { item: PlanSnapshotStep; index: number }>();
  existing.forEach((item, index) => {
    existingIndex.set(createPlanKey(item, index), { item, index });
  });

  const usedKeys = new Set<string>();
  const result: PlanSnapshot = [];

  incoming.forEach((item, index) => {
    const key = createPlanKey(item, index);
    const existingMatch = existingIndex.get(key);

    if (existingMatch) {
      const mergedItem = mergePlanItems(existingMatch.item, item);
      usedKeys.add(key);
      if (mergedItem) {
        result.push(mergedItem);
      }
    } else if (!isAbandonedStatus(item?.status)) {
      const cloned = deepCloneValue(item);
      if (cloned && typeof cloned === 'object') {
        cloned.status = PENDING_STATUS;
      }
      result.push(cloned as PlanSnapshotStep);
    }
  });

  existing.forEach((item, index) => {
    const key = createPlanKey(item, index);
    if (!usedKeys.has(key)) {
      result.push(item);
    }
  });

  return result;
};
