/**
 * Plan utilities extracted from the agent loop.
 */

const PLAN_CHILD_KEYS = ['substeps', 'children', 'steps'];
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);

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

  if (normalized === 'failed') {
    return true;
  }

  return isCompletedStatus(normalized);
}

function normalizeStepLabel(stepValue) {
  if (stepValue === null || stepValue === undefined) {
    return '';
  }

  const raw = String(stepValue).trim();
  if (!raw) {
    return '';
  }

  return raw.replace(/\.+$/, '');
}

function createPlanKey(item, fallbackIndex) {
  if (!item || typeof item !== 'object') {
    return `index:${fallbackIndex}`;
  }

  const label = normalizeStepLabel(item.step);
  if (label) {
    return `step:${label.toLowerCase()}`;
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

  for (const key of PLAN_CHILD_KEYS) {
    if (Array.isArray(item[key])) {
      cloned[key] = item[key].map((child) => clonePlanItem(child));
    } else if (cloned[key] && !Array.isArray(cloned[key])) {
      delete cloned[key];
    }
  }

  return cloned;
}

function selectChildKey(existingItem, incomingItem) {
  for (const key of PLAN_CHILD_KEYS) {
    if (Array.isArray(incomingItem?.[key])) {
      return key;
    }
  }

  for (const key of PLAN_CHILD_KEYS) {
    if (Array.isArray(existingItem?.[key])) {
      return key;
    }
  }

  return null;
}

const VOLATILE_KEYS = new Set(['age']);

function mergePlanItems(existingItem, incomingItem) {
  if (!existingItem || typeof existingItem !== 'object') {
    return clonePlanItem(incomingItem);
  }

  if (!incomingItem || typeof incomingItem !== 'object') {
    return existingItem;
  }

  for (const [key, value] of Object.entries(incomingItem)) {
    if (VOLATILE_KEYS.has(key)) {
      continue;
    }

    if (PLAN_CHILD_KEYS.includes(key)) {
      continue;
    }

    existingItem[key] = value;
  }

  const childKey = selectChildKey(existingItem, incomingItem);
  if (childKey) {
    const existingChildren = Array.isArray(existingItem[childKey]) ? existingItem[childKey] : [];
    const incomingChildren = Array.isArray(incomingItem[childKey]) ? incomingItem[childKey] : [];
    existingItem[childKey] = mergePlanTrees(existingChildren, incomingChildren);

    for (const key of PLAN_CHILD_KEYS) {
      if (key !== childKey && key in existingItem) {
        delete existingItem[key];
      }
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
      result.push(mergePlanItems(existingMatch.item, item));
      usedKeys.add(key);
    } else {
      result.push(clonePlanItem(item));
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
  const hasOpen = (items) => {
    if (!Array.isArray(items)) {
      return false;
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const statusValue = typeof item.status === 'string' ? item.status : '';

      const childKey = PLAN_CHILD_KEYS.find((key) => Array.isArray(item[key]));
      if (childKey && hasOpen(item[childKey])) {
        return true;
      }

      if (!isTerminalStatus(statusValue)) {
        return true;
      }
    }

    return false;
  };

  return hasOpen(plan);
}

export function planStepHasIncompleteChildren(step) {
  if (!step || typeof step !== 'object') {
    return false;
  }

  for (const key of PLAN_CHILD_KEYS) {
    const children = Array.isArray(step[key]) ? step[key] : null;
    if (!children || children.length === 0) {
      continue;
    }

    for (const child of children) {
      if (!child || typeof child !== 'object') {
        return true;
      }

      if (!isCompletedStatus(child.status)) {
        return true;
      }

      if (planStepHasIncompleteChildren(child)) {
        return true;
      }
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

    const childKey = PLAN_CHILD_KEYS.find(
      (key) => Array.isArray(item[key]) && item[key].length > 0,
    );

    if (childKey) {
      const childProgress = aggregateProgress(item[childKey]);
      if (childProgress.total > 0) {
        completed += childProgress.completed;
        total += childProgress.total;
        continue;
      }
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

function formatPlanLine(item, index, ancestors, depth, lines) {
  if (!item || typeof item !== 'object') {
    return;
  }

  const sanitizedStep = normalizeStepLabel(item.step);
  const hasExplicitStep = sanitizedStep.length > 0;
  const labelParts = hasExplicitStep
    ? sanitizedStep.split('.').filter((part) => part.length > 0)
    : [...ancestors, String(index + 1)];

  const stepLabel = labelParts.join('.');
  const indent = '  '.repeat(depth);
  const title =
    typeof item.title === 'string' && item.title.trim().length > 0 ? item.title.trim() : '';
  const status =
    typeof item.status === 'string' && item.status.trim().length > 0 ? item.status.trim() : '';

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

  const childKey = PLAN_CHILD_KEYS.find((key) => Array.isArray(item[key]));
  if (childKey) {
    const nextAncestors = hasExplicitStep ? labelParts : [...ancestors, String(index + 1)];
    formatPlanSection(item[childKey], nextAncestors, depth + 1, lines);
  }
}

function formatPlanSection(items, ancestors, depth, lines) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  items.forEach((item, index) => {
    formatPlanLine(item, index, ancestors, depth, lines);
  });
}

export function planToMarkdown(plan) {
  const header = '# Active Plan\n\n';

  if (!Array.isArray(plan) || plan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines = [];
  formatPlanSection(plan, [], 0, lines);

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
