/**
 * Plan utilities extracted from the agent loop.
 */

const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);
const CHILD_KEY = 'substeps';

function isCompletedStatus(status) {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (COMPLETED_STATUSES.has(normalized)) {
    return true;
  }

  return normalized.startsWith('complete');
}

function isTerminalStatus(status) {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === 'failed' || normalized === 'abandoned') {
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

function createPlanKey(item, fallbackIndex) {
  if (!item || typeof item !== 'object') {
    return `index:${fallbackIndex}`;
  }

  const id = typeof item.id === 'string' ? item.id.trim() : '';
  if (id) {
    return `id:${id.toLowerCase()}`;
  }

  if (typeof item.title === 'string' && item.title.trim().length > 0) {
    return `title:${item.title.trim().toLowerCase()}`;
  }

  return `index:${fallbackIndex}`;
}

function clonePlanItem(item) {
  if (!item || typeof item !== 'object') {
    return {};
  }

  const cloned = { ...item };

  delete cloned.children;
  delete cloned.steps;
  delete cloned[CHILD_KEY];

  return cloned;
}

const VOLATILE_KEYS = new Set(['age']);

function normalizeWaitingForIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function mergePlanItems(existingItem, incomingItem) {
  if (!existingItem || typeof existingItem !== 'object') {
    return clonePlanItem(incomingItem);
  }

  if (!incomingItem || typeof incomingItem !== 'object') {
    return existingItem;
  }

  if (isAbandonedStatus(incomingItem.status)) {
    return null;
  }

  for (const [key, value] of Object.entries(incomingItem)) {
    if (VOLATILE_KEYS.has(key) || key === CHILD_KEY) {
      continue;
    }

    if (key === 'children' || key === 'steps') {
      continue;
    }

    if (key === 'waitingForId') {
      existingItem.waitingForId = normalizeWaitingForIds(value);
      continue;
    }

    if (key === 'priority') {
      const numeric = Number.parseInt(value, 10);
      existingItem.priority = Number.isFinite(numeric) ? numeric : 0;
      continue;
    }

    if (key === 'id' && typeof value === 'string') {
      existingItem.id = value.trim();
      continue;
    }

    existingItem[key] = value;
  }

  delete existingItem.children;
  delete existingItem.steps;

  if (Object.prototype.hasOwnProperty.call(incomingItem, 'waitingForId')) {
    existingItem.waitingForId = normalizeWaitingForIds(incomingItem.waitingForId);
  }

  if (Object.prototype.hasOwnProperty.call(incomingItem, 'priority')) {
    const numeric = Number.parseInt(incomingItem.priority, 10);
    existingItem.priority = Number.isFinite(numeric) ? numeric : 0;
  }

  if (Object.prototype.hasOwnProperty.call(incomingItem, 'id')) {
    const text = typeof incomingItem.id === 'string' ? incomingItem.id.trim() : '';
    if (text) {
      existingItem.id = text;
    }
  }

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
      const cloned = clonePlanItem(item);
      cloned.waitingForId = normalizeWaitingForIds(item?.waitingForId);
      const numeric = Number.parseInt(item?.priority, 10);
      cloned.priority = Number.isFinite(numeric) ? numeric : 0;
      if (typeof cloned.id === 'string') {
        cloned.id = cloned.id.trim();
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

    const statusValue = typeof item.status === 'string' ? item.status : '';
    return !isTerminalStatus(statusValue);
  });
}

function buildPlanLookup(plan) {
  const lookup = new Map();
  if (!Array.isArray(plan)) {
    return lookup;
  }

  plan.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (id && !lookup.has(id)) {
      lookup.set(id, item);
    }
  });

  return lookup;
}

function isDependencyComplete(dependency, lookup, visiting) {
  if (!dependency || typeof dependency !== 'string') {
    return false;
  }

  const id = dependency.trim();
  if (!id) {
    return false;
  }

  if (visiting.has(id)) {
    return false;
  }

  const match = lookup.get(id);
  if (!match || typeof match !== 'object') {
    return false;
  }

  const statusValue = typeof match.status === 'string' ? match.status : '';
  if (isCompletedStatus(statusValue)) {
    return true;
  }

  if (!Array.isArray(match.waitingForId) || match.waitingForId.length === 0) {
    return false;
  }

  visiting.add(id);
  const allComplete = match.waitingForId.every((idRef) => isDependencyComplete(idRef, lookup, visiting));
  visiting.delete(id);

  return allComplete;
}

export function planStepHasIncompleteDependencies(plan, step) {
  if (!step || typeof step !== 'object') {
    return false;
  }

  if (!Array.isArray(step.waitingForId) || step.waitingForId.length === 0) {
    return false;
  }

  const lookup = buildPlanLookup(plan);
  const visiting = new Set();

  return step.waitingForId.some((dependency) => !isDependencyComplete(dependency, lookup, visiting));
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
    if (isCompletedStatus(item.status)) {
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

function formatPlanLine(item, lines) {
  if (!item || typeof item !== 'object') {
    return;
  }

  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const title =
    typeof item.title === 'string' && item.title.trim().length > 0 ? item.title.trim() : '';
  const status =
    typeof item.status === 'string' && item.status.trim().length > 0 ? item.status.trim() : '';
  const priority = Number.isFinite(item.priority) ? item.priority : 0;

  const lineParts = [];
  lineParts.push(id ? `#${id}` : 'Step');
  if (title) {
    lineParts.push(`- ${title}`);
  }
  if (status) {
    lineParts.push(`[${status}]`);
  }
  lineParts.push(`(priority ${priority})`);

  if (lineParts.length === 0) {
    return;
  }

  lines.push(lineParts.join(' ').trimEnd());
}

export function planToMarkdown(plan) {
  const header = '# Active Plan\n\n';

  if (!Array.isArray(plan) || plan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines = [];
  plan.forEach((item) => {
    formatPlanLine(item, lines);
  });

  if (lines.length === 0) {
    return `${header}_No active plan._\n`;
  }

  return `${header}${lines.join('\n')}\n`;
}

export default {
  mergePlanTrees,
  planHasOpenSteps,
  computePlanProgress,
  planToMarkdown,
};
