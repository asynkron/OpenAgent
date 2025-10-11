/**
 * Helpers for transforming agent plans into renderable structures shared between
 * the Ink components and the legacy console helpers.
 */

const CHILD_KEYS = ['substeps', 'children', 'steps'];

const MAX_COMMAND_PREVIEW_LENGTH = 80;
const COMPLETED_STATUSES = new Set(['completed', 'done']);

// Ensure age is always a non-negative integer so the UI can display it consistently.
function coerceAge(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  return 0;
}

// Produce a trimmed preview of the next shell command so humans can reason about the step.
function buildCommandPreview(command) {
  if (!command || typeof command !== 'object') {
    return '';
  }

  const { run } = command;
  if (typeof run !== 'string') {
    return '';
  }

  const collapsed = run.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) {
    return '';
  }

  if (collapsed.length <= MAX_COMMAND_PREVIEW_LENGTH) {
    return `run: ${collapsed}`;
  }

  const truncated = collapsed.slice(0, MAX_COMMAND_PREVIEW_LENGTH - 1).trimEnd();
  return `run: ${truncated}…`;
}

function normalizeStatus(status) {
  return typeof status === 'string' ? status.toLowerCase() : '';
}

function isCompletedStatus(status) {
  return COMPLETED_STATUSES.has(normalizeStatus(status));
}

function resolveStatusDetails(status) {
  const normalized = normalizeStatus(status);

  if (normalized === 'completed' || normalized === 'done') {
    return { symbol: '✔', color: 'green' };
  }

  if (normalized === 'running' || normalized === 'in_progress' || normalized === 'in-progress') {
    return { symbol: '▶', color: 'yellow' };
  }

  if (normalized === 'blocked' || normalized === 'failed' || normalized === 'error') {
    return { symbol: '✖', color: 'red' };
  }

  return { symbol: '•', color: 'gray' };
}

function sanitizeStepValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().replace(/\.+$/, '');
}

function buildLabelParts(rawStep, index, ancestors) {
  const sanitized = sanitizeStepValue(rawStep);
  const hasExplicitStep = sanitized.length > 0;
  const baseStep = hasExplicitStep ? sanitized : String(index + 1);
  const usesAbsolutePath = hasExplicitStep && sanitized.includes('.');
  const labelParts = usesAbsolutePath
    ? sanitized
        .split('.')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    : [...ancestors, baseStep];

  return { label: labelParts.join('.'), labelParts };
}

function traversePlan(items, ancestors = [], depth = 0, collection = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return collection;
  }

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const { label, labelParts } = buildLabelParts(item.step, index, ancestors);
    const status = item.status;
    if (isCompletedStatus(status)) {
      return;
    }

    const { symbol, color } = resolveStatusDetails(status);
    const title = item.title !== undefined && item.title !== null ? String(item.title) : '';
    const id = `${label || depth}-${index}-${depth}`;
    const age = coerceAge(item.age);
    const commandPreview = buildCommandPreview(item.command);

    collection.push({
      id,
      label,
      depth,
      symbol,
      color,
      title,
      age,
      commandPreview,
    });

    const childKey = CHILD_KEYS.find((key) => Array.isArray(item[key]));
    if (childKey) {
      traversePlan(item[childKey], labelParts, depth + 1, collection);
    }
  });

  return collection;
}

export function createPlanNodes(plan) {
  return traversePlan(Array.isArray(plan) ? plan : []);
}

export function buildPlanLines(plan) {
  const nodes = createPlanNodes(plan);
  return nodes.map((node) => {
    const indent = '  '.repeat(node.depth);
    const titlePart = node.title ? ` ${node.title}` : '';
    const agePart = ` (age ${node.age ?? 0})`;
    const commandPart = node.commandPreview ? ` — ${node.commandPreview}` : '';
    return `${indent}${node.symbol} ${node.label}.${titlePart}${agePart}${commandPart}`.trimEnd();
  });
}

export default {
  createPlanNodes,
  buildPlanLines,
};
