/**
 * Plan utilities extracted from the agent loop.
 */

const PLAN_CHILD_KEYS = ['substeps', 'children', 'steps'];
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);

const asPlanArray = (value) => (Array.isArray(value) ? value : []);

function isCompletedStatus(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!normalized) {
    return false;
  }

  return COMPLETED_STATUSES.has(normalized) || normalized.startsWith('complete');
}

function normalizeStepLabel(stepValue) {
  return String(stepValue ?? '').trim().replace(/\.+$/, '');
}

function createPlanKey(item = {}, fallbackIndex) {
  const label = normalizeStepLabel(item.step);
  if (label) {
    return `step:${label.toLowerCase()}`;
  }

  const title = typeof item.title === 'string' ? item.title.trim().toLowerCase() : '';
  if (title) {
    return `title:${title}`;
  }

  return `index:${fallbackIndex}`;
}

function clonePlanItem(item = {}) {
  const cloned = { ...item };

  for (const key of PLAN_CHILD_KEYS) {
    const children = asPlanArray(item[key]);
    if (children.length > 0) {
      cloned[key] = children.map(clonePlanItem);
    } else {
      delete cloned[key];
    }
  }

  return cloned;
}

function selectChildKey(existingItem = {}, incomingItem = {}) {
  return (
    PLAN_CHILD_KEYS.find((key) => Array.isArray(incomingItem[key])) ??
    PLAN_CHILD_KEYS.find((key) => Array.isArray(existingItem[key])) ??
    null
  );
}

function mergePlanItems(existingItem = {}, incomingItem = {}) {
  const base = clonePlanItem(existingItem);
  const incoming = clonePlanItem(incomingItem);

  if (Object.keys(base).length === 0) {
    return incoming;
  }

  if (Object.keys(incoming).length === 0) {
    return base;
  }

  const merged = { ...base, ...incoming };
  const childKey = selectChildKey(existingItem, incomingItem);

  if (childKey) {
    const existingChildren = asPlanArray(existingItem[childKey]);
    const incomingChildren = asPlanArray(incomingItem[childKey]);
    merged[childKey] = mergePlanTrees(existingChildren, incomingChildren);

    for (const key of PLAN_CHILD_KEYS) {
      if (key !== childKey) {
        delete merged[key];
      }
    }
  }

  return merged;
}

export function mergePlanTrees(existingPlan, incomingPlan) {
  const existing = asPlanArray(existingPlan);
  const incoming = asPlanArray(incomingPlan);

  if (incoming.length === 0) {
    return [];
  }

  const existingIndex = new Map();
  existing.forEach((item, index) => {
    existingIndex.set(createPlanKey(item, index), item);
  });

  const usedKeys = new Set();
  const result = incoming.map((item, index) => {
    const key = createPlanKey(item, index);
    const existingMatch = existingIndex.get(key);

    if (existingMatch) {
      usedKeys.add(key);
      return mergePlanItems(existingMatch, item);
    }

    return clonePlanItem(item);
  });

  existing.forEach((item, index) => {
    const key = createPlanKey(item, index);
    if (!usedKeys.has(key)) {
      result.push(clonePlanItem(item));
    }
  });

  return result;
}

export function planHasOpenSteps(plan) {
  const hasOpen = (items) =>
    asPlanArray(items).some((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
      const childKey = PLAN_CHILD_KEYS.find((key) => asPlanArray(item[key]).length > 0);

      if (childKey && hasOpen(item[childKey])) {
        return true;
      }

      return status !== 'completed';
    });

  return hasOpen(plan);
}

function aggregateProgress(items) {
  return asPlanArray(items).reduce(
    (acc, item) => {
      if (!item || typeof item !== 'object') {
        return acc;
      }

      const childKey = PLAN_CHILD_KEYS.find((key) => asPlanArray(item[key]).length > 0);

      if (childKey) {
        const childProgress = aggregateProgress(item[childKey]);
        if (childProgress.total > 0) {
          acc.completed += childProgress.completed;
          acc.total += childProgress.total;
          return acc;
        }
      }

      acc.total += 1;
      if (isCompletedStatus(item.status)) {
        acc.completed += 1;
      }
      return acc;
    },
    { completed: 0, total: 0 },
  );
}

export function computePlanProgress(plan) {
  const { completed, total } = aggregateProgress(plan);
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const remaining = Math.max(0, total - completed);

  return {
    completedSteps: completed,
    remainingSteps: remaining,
    totalSteps: total,
    ratio,
  };
}

function formatPlanLine(item = {}, index, ancestors, depth, lines) {
  if (!item || typeof item !== 'object') {
    return;
  }

  const sanitizedStep = normalizeStepLabel(item.step);
  const hasExplicitStep = sanitizedStep.length > 0;
  const labelParts = hasExplicitStep
    ? sanitizedStep.split('.').filter(Boolean)
    : [...ancestors, String(index + 1)];

  const stepLabel = labelParts.join('.');
  const indent = '  '.repeat(depth);
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const status = typeof item.status === 'string' ? item.status.trim() : '';

  const lineParts = [];
  if (stepLabel) {
    lineParts.push(`Step ${stepLabel}`);
  }
  if (title) {
    lineParts.push(`- ${title}`);
  }
  if (status) {
    lineParts.push(`[${status}]`);
  }

  if (lineParts.length === 0) {
    return;
  }

  lines.push(`${indent}${lineParts.join(' ')}`.trimEnd());

  const childKey = PLAN_CHILD_KEYS.find((key) => asPlanArray(item[key]).length > 0);
  if (childKey) {
    const nextAncestors = hasExplicitStep ? labelParts : [...ancestors, String(index + 1)];
    formatPlanSection(item[childKey], nextAncestors, depth + 1, lines);
  }
}

function formatPlanSection(items, ancestors, depth, lines) {
  asPlanArray(items).forEach((item, index) => {
    formatPlanLine(item, index, ancestors, depth, lines);
  });
}

export function planToMarkdown(plan) {
  const header = '# Active Plan\n\n';

  const normalizedPlan = asPlanArray(plan);
  if (normalizedPlan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines = [];
  formatPlanSection(normalizedPlan, [], 0, lines);

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
