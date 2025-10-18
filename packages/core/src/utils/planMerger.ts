import type { PlanSnapshot, PlanSnapshotStep } from './planCloneUtils.js';
import { deepCloneValue } from './planCloneUtils.js';
import {
  isAbandonedStatus,
  isCompletedStatus,
  isFailedStatus,
  isTerminalStatus,
} from './planStatusUtils.js';
import { commandsAreEqual } from './planComparisonUtils.js';
import { PlanStatus } from '../contracts/index.js';

const normalizePlanIdentifier = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed || '';
};

const createPlanKey = (
  item: PlanSnapshotStep | null | undefined,
  fallbackIndex: number,
): string => {
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
  const incomingStatus = incomingItem?.status;
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
        existingItem.status = PlanStatus.Pending;
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
        (cloned as PlanSnapshotStep).status = PlanStatus.Pending;
      }
      result.push(cloned);
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
