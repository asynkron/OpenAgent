import { clonePlanTree, deepCloneValue, type PlanItem, type PlanTree } from './planCloneUtils.js';
import { isAbandonedStatus, isCompletedStatus, isFailedStatus, isTerminalStatus } from './planStatusUtils.js';
import { commandsAreEqual } from './planComparisonUtils.js';

const normalizePlanIdentifier = (value: string | number | null | undefined): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  const trimmed = String(value).trim();
  return trimmed || '';
};

const createPlanKey = (item: PlanItem, fallbackIndex: number): string => {
  const id = normalizePlanIdentifier(item.id);
  if (id) {
    return `id:${id.toLowerCase()}`;
  }

  if (item.title.trim().length > 0) {
    return `title:${item.title.trim().toLowerCase()}`;
  }

  return `index:${fallbackIndex}`;
};

const mergePlanItems = (existingItem: PlanItem, incomingItem: PlanItem): PlanItem | null => {
  if (isAbandonedStatus(incomingItem.status)) {
    return null;
  }

  existingItem.waitingForId = incomingItem.waitingForId.slice();
  existingItem.title = incomingItem.title;
  existingItem.priority = incomingItem.priority;
  if (incomingItem.observation) {
    existingItem.observation = deepCloneValue(incomingItem.observation);
  }

  const incomingCommand = incomingItem.command;
  const incomingStatus = incomingItem.status;
  const allowCommandUpdate = !isCompletedStatus(incomingStatus);

  if (allowCommandUpdate && incomingCommand) {
    const existingCommand = existingItem.command;
    const commandChanged = !existingCommand || !commandsAreEqual(existingCommand, incomingCommand);

    if (commandChanged) {
      existingItem.command = deepCloneValue(incomingCommand);

      const incomingIsTerminal = isTerminalStatus(incomingStatus) || isAbandonedStatus(incomingStatus);
      const shouldResetStatus =
        isFailedStatus(existingItem.status) ||
        (isAbandonedStatus(existingItem.status) && !incomingIsTerminal);

      if (shouldResetStatus) {
        existingItem.status = 'pending';
      }
    }
  }

  return existingItem;
};

export const mergePlanTrees = (
  existingPlan: PlanTree | null | undefined = [],
  incomingPlan: PlanTree | null | undefined = [],
): PlanTree => {
  const existing = Array.isArray(existingPlan) ? existingPlan : [];
  const incoming = clonePlanTree(incomingPlan ?? []);

  if (incoming.length === 0) {
    return [];
  }

  const existingIndex = new Map<string, { item: PlanItem; index: number }>();
  existing.forEach((item, index) => {
    existingIndex.set(createPlanKey(item, index), { item, index });
  });

  const usedKeys = new Set<string>();
  const result: PlanTree = [];

  incoming.forEach((item, index) => {
    const key = createPlanKey(item, index);
    const existingMatch = existingIndex.get(key);

    if (existingMatch) {
      const mergedItem = mergePlanItems(existingMatch.item, item);
      usedKeys.add(key);
      if (mergedItem) {
        result.push(mergedItem);
      }
    } else if (!isAbandonedStatus(item.status)) {
      const cloned = deepCloneValue(item);
      cloned.status = 'pending';
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
