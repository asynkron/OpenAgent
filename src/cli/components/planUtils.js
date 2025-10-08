/**
 * Helpers for transforming agent plans into renderable structures shared between
 * the Ink components and the legacy console helpers.
 */

const CHILD_KEYS = ['substeps', 'children', 'steps'];

function resolveStatusDetails(status) {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';

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
    const { symbol, color } = resolveStatusDetails(item.status);
    const title = item.title !== undefined && item.title !== null ? String(item.title) : '';
    const id = `${label || depth}-${index}-${depth}`;

    collection.push({
      id,
      label,
      depth,
      symbol,
      color,
      title,
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
    return `${indent}${node.symbol} ${node.label}.${titlePart}`.trimEnd();
  });
}

export default {
  createPlanNodes,
  buildPlanLines,
};
