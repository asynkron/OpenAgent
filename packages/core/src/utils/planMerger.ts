import type { PlanItem } from './planCloneUtils.js';
import { deepCloneValue } from './planCloneUtils.js';
import { isAbandonedStatus, isCompletedStatus, isFailedStatus, isTerminalStatus } from './planStatusUtils.js';
import { commandsAreEqual } from './planComparisonUtils.js';

const normalizePlanIdentifier = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed || '';
};

const createPlanKey = (item: unknown, fallbackIndex: number): string => {
  if (!item || typeof item !== 'object') {
    return `index:${fallbackIndex}`;
  }

  const planItem = item as PlanItem;
  const id = normalizePlanIdentifier(planItem.id);
  if (id) {
    return `id:${id.toLowerCase()}`;
  }

  if (typeof planItem.title === 'string' && planItem.title.trim().length > 0) {
    return `title:${planItem.title.trim().toLowerCase()}`;
  }

  return `index:${fallbackIndex}`;
};

const mergePlanItems = (existingItem: PlanItem, incomingItem: PlanItem): PlanItem | null => {
  if (!existingItem || typeof existingItem !== 'object') {
    return deepCloneValue(incomingItem);
  }

  if (!incomingItem || typeof incomingItem !== 'object') {
    return existingItem;
  }

  if (isAbandonedStatus(incomingItem.status)) {
    return null;
  }

  existingItem.waitingForId = incomingItem.waitingForId || [];

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
        existingItem.status = 'pending';
      }
    }
  }

  return existingItem;
};

export const mergePlanTrees = (existingPlan: unknown = [], incomingPlan: unknown = []): PlanItem[] => {
  const existing = Array.isArray(existingPlan) ? existingPlan : [];
  const incoming = Array.isArray(incomingPlan) ? incomingPlan : [];

  if (incoming.length === 0) {
    return [];
  }

  const existingIndex = new Map<string, { item: PlanItem; index: number }>();
  existing.forEach((item, index) => {
    existingIndex.set(createPlanKey(item, index), { item, index });
  });

  const usedKeys = new Set<string>();
  const result: PlanItem[] = [];

  incoming.forEach((item, index) => {
    const key = createPlanKey(item, index);
    const existingMatch = existingIndex.get(key);

    if (existingMatch) {
      const mergedItem = mergePlanItems(existingMatch.item, item);
      usedKeys.add(key);
      if (mergedItem) {
        result.push(mergedItem);
      }
    } else if (!isAbandonedStatus((item as PlanItem)?.status)) {
      const cloned = deepCloneValue(item);
      if (cloned && typeof cloned === 'object') {
        (cloned as PlanItem).status = 'pending';
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
