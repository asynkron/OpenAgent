// @ts-nocheck
/**
 * Helpers for transforming agent plans into renderable structures shared between
 * the Ink components and the legacy console helpers.
 */

const MAX_COMMAND_PREVIEW_LENGTH = 80;
const TERMINAL_STATUSES = new Set(['completed', 'done', 'failed']);

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

function resolveStatusDetails(status, blocked) {
  const normalized = normalizeStatus(status);

  if (blocked) {
    return { symbol: '⏳', color: 'yellow' };
  }

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

function normalizeId(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed;
}

function buildPlanLookup(plan) {
  const lookup = new Map();

  if (!Array.isArray(plan)) {
    return lookup;
  }

  plan.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id = normalizeId(item.id) || `index:${index}`;
    if (!lookup.has(id)) {
      lookup.set(id, item);
    }
  });

  return lookup;
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

function dependenciesFor(step) {
  if (!step || typeof step !== 'object') {
    return [];
  }

  if (!Array.isArray(step.waitingForId)) {
    return [];
  }

  return step.waitingForId.map((value) => normalizeId(value)).filter((value) => value.length > 0);
}

function isStepBlocked(step, lookup) {
  const dependencies = dependenciesFor(step);
  if (dependencies.length === 0) {
    return false;
  }

  if (!lookup || lookup.size === 0) {
    return true;
  }

  return dependencies.some((dependencyId) => {
    const dependency = lookup.get(dependencyId);
    if (!dependency) {
      return true;
    }

    return !isTerminalStatus(dependency.status);
  });
}

function parsePriority(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function decoratePlan(plan) {
  if (!Array.isArray(plan)) {
    return [];
  }

  const lookup = buildPlanLookup(plan);

  return plan
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const blocked = isStepBlocked(item, lookup);
      const priority = parsePriority(item.priority);
      const waitingFor = dependenciesFor(item);

      return {
        item,
        blocked,
        priority,
        waitingFor,
        index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.blocked !== b.blocked) {
        return a.blocked ? 1 : -1;
      }

      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      return a.index - b.index;
    });
}

export function createPlanNodes(plan) {
  const decorated = decoratePlan(plan);

  return decorated.map((entry, order) => {
    const { item, blocked, priority, waitingFor } = entry;
    const status = item.status !== undefined && item.status !== null ? String(item.status) : '';
    const { symbol, color } = resolveStatusDetails(status, blocked);
    const title = item.title !== undefined && item.title !== null ? String(item.title) : '';
    const age = coerceAge(item.age);
    const commandPreview = buildCommandPreview(item.command);
    const id = normalizeId(item.id) || `${order}-${entry.index}`;

    return {
      id,
      label: String(order + 1),
      depth: 0,
      symbol,
      color,
      title,
      age,
      commandPreview,
      status,
      priority: Number.isFinite(priority) ? priority : null,
      waitingFor,
      blocked,
    };
  });
}

export function buildPlanLines(plan) {
  const nodes = createPlanNodes(plan);
  return nodes.map((node) => {
    const indent = '  '.repeat(node.depth);
    const titlePart = node.title ? ` ${node.title}` : '';
    const statusPart = node.status ? ` [${node.status}]` : '';
    const metaDetails = [];
    if (Number.isFinite(node.priority)) {
      metaDetails.push(`priority ${node.priority}`);
    }
    if (node.blocked && node.waitingFor.length > 0) {
      metaDetails.push(`waiting for ${node.waitingFor.join(', ')}`);
    }
    metaDetails.push(`age ${node.age ?? 0}`);
    const metaPart = metaDetails.length > 0 ? ` (${metaDetails.join(', ')})` : '';
    const commandPart = node.commandPreview ? ` — ${node.commandPreview}` : '';
    return `${indent}${node.symbol} ${node.label}.${titlePart}${statusPart}${metaPart}${commandPart}`.trimEnd();
  });
}

export default {
  createPlanNodes,
  buildPlanLines,
};
