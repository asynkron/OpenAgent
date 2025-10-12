// @ts-nocheck
/**
 * Plan utilities extracted from the agent loop.
 */

const hasStructuredClone = typeof globalThis.structuredClone === 'function';

function deepCloneValue(value) {
  if (hasStructuredClone) {
    try {
      return globalThis.structuredClone(value);
    } catch (_error) {
      // Fall through to JSON fallback.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    // As a last resort return the original reference.
    return value;
  }
}

function isCompletedStatus(status) {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized == 'completed') {
    return true;
  }

  return false;
}

function isTerminalStatus(status) {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === 'failed') {
    return true;
  }

  return isCompletedStatus(normalized);
}

function isAbandonedStatus(status) {
  if (typeof status !== 'string') {
    return false;
  }

  return status.trim().toLowerCase() === 'abandoned';
}

function normalizePlanIdentifier(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed;
}

function createPlanKey(item, fallbackIndex) {
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
}

function mergePlanItems(existingItem, incomingItem) {
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

  return existingItem;
}

export function mergePlanTrees(existingPlan = [], incomingPlan = []) {
  const existing = Array.isArray(existingPlan) ? existingPlan : [];
  const incoming = Array.isArray(incomingPlan) ? incomingPlan : [];

  if (incoming.length === 0) {
    return [];
  }

  const existingIndex = new Map();
  existing.forEach((item, index) => {
    existingIndex.set(createPlanKey(item, index), { item, index });
  });

  const usedKeys = new Set();
  const result = [];

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
        cloned.status = 'pending';
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
}

export function planHasOpenSteps(plan) {
  if (!Array.isArray(plan) || plan.length === 0) {
    return false;
  }

  return plan.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    return !isTerminalStatus(item.status);
  });
}

export function buildPlanLookup(plan) {
  const lookup = new Map();

  if (!Array.isArray(plan)) {
    return lookup;
  }

  plan.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id = normalizePlanIdentifier(item.id) || `index:${index}`;
    if (!lookup.has(id)) {
      lookup.set(id, item);
    }
  });

  return lookup;
}

export function planStepIsBlocked(step, planOrLookup) {
  if (!step || typeof step !== 'object') {
    return false;
  }

  const dependencies = Array.isArray(step.waitingForId) ? step.waitingForId : [];
  if (dependencies.length === 0) {
    return false;
  }

  const lookup =
    planOrLookup instanceof Map
      ? planOrLookup
      : planOrLookup
        ? buildPlanLookup(planOrLookup)
        : new Map();

  if (lookup.size === 0) {
    return true;
  }

  for (const rawId of dependencies) {
    const dependencyId = normalizePlanIdentifier(rawId);
    if (!dependencyId) {
      return true;
    }

    const dependency = lookup.get(dependencyId);
    if (!dependency || !isCompletedStatus(dependency.status)) {
      return true;
    }
  }

  return false;
}

function aggregateProgress(items) {
  let completed = 0;
  let total = 0;

  if (!Array.isArray(items) || items.length === 0) {
    return { completed, total };
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    total += 1;
    if (isTerminalStatus(item.status)) {
      completed += 1;
    }
  }

  return { completed, total };
}

export function computePlanProgress(plan) {
  const { completed, total } = aggregateProgress(Array.isArray(plan) ? plan : []);
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const remaining = Math.max(0, total - completed);

  return {
    completedSteps: completed,
    remainingSteps: remaining,
    totalSteps: total,
    ratio,
  };
}

export function planToMarkdown(plan) {
  const header = '# Active Plan\n\n';

  if (!Array.isArray(plan) || plan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines = [];

  plan.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const title =
      typeof item.title === 'string' && item.title.trim().length > 0
        ? item.title.trim()
        : `Task ${index + 1}`;
    const status =
      typeof item.status === 'string' && item.status.trim().length > 0 ? item.status.trim() : '';
    const priority = Number.isFinite(Number(item.priority)) ? Number(item.priority) : null;
    const dependencies = Array.isArray(item.waitingForId)
      ? item.waitingForId
          .filter((value) => normalizePlanIdentifier(value))
          .map((value) => value.trim())
      : [];

    const details = [];
    if (priority !== null) {
      details.push(`priority ${priority}`);
    }
    if (dependencies.length > 0) {
      details.push(`waiting for ${dependencies.join(', ')}`);
    }

    const detailsText = details.length > 0 ? ` (${details.join(', ')})` : '';
    const statusText = status ? ` [${status}]` : '';

    lines.push(`Step ${index + 1} - ${title}${statusText}${detailsText}`);
  });

  if (lines.length === 0) {
    return `${header}_No active plan._\n`;
  }

  return `${header}${lines.join('\n')}\n`;
}

export function clonePlanTree(plan) {
  if (!Array.isArray(plan)) {
    return [];
  }

  const cloned = deepCloneValue(plan);
  return Array.isArray(cloned) ? cloned : [];
}

export default {
  mergePlanTrees,
  planHasOpenSteps,
  computePlanProgress,
  planToMarkdown,
  planStepIsBlocked,
  buildPlanLookup,
  clonePlanTree,
};
