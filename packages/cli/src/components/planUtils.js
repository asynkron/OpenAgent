/**
 * Helpers for transforming agent plans into renderable structures shared between
 * the Ink components and the legacy console helpers.
 */

const MAX_COMMAND_PREVIEW_LENGTH = 80;
const COMPLETED_STATUSES = new Set(['completed', 'done']);
const TERMINAL_STATUSES = new Set(['completed', 'done', 'failed', 'abandoned']);

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

function resolveStatusDetails(status, { canExecute, hasMissingDependencies }) {
  const normalized = normalizeStatus(status);

  if (normalized === 'completed' || normalized === 'done') {
    return { symbol: '✔', color: 'green' };
  }

  if (normalized === 'failed' || normalized === 'error' || normalized === 'abandoned') {
    return { symbol: '✖', color: 'red' };
  }

  if (normalized === 'running' || normalized === 'in_progress' || normalized === 'in-progress') {
    return { symbol: '▶', color: 'yellow' };
  }

  if (!canExecute) {
    return { symbol: hasMissingDependencies ? '!' : '⏳', color: 'gray' };
  }

  return { symbol: '•', color: 'cyan' };
}

function normalizeWaitingList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
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

function evaluateDependencies(waitingForIds, lookup) {
  if (!waitingForIds || waitingForIds.length === 0) {
    return { complete: true, missing: false };
  }

  let complete = true;
  let missing = false;

  waitingForIds.forEach((dependency) => {
    const match = lookup.get(dependency);
    if (!match) {
      complete = false;
      missing = true;
      return;
    }

    if (!COMPLETED_STATUSES.has(normalizeStatus(match.status))) {
      complete = false;
    }
  });

  return { complete, missing };
}

function coercePriority(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function createPlanNodes(plan) {
  const items = Array.isArray(plan) ? plan : [];
  const lookup = buildPlanLookup(items);
  const nodes = [];

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const stableId = id || `task-${index}`;
    const title = item.title !== undefined && item.title !== null ? String(item.title) : '';
    const status = typeof item.status === 'string' ? item.status : '';
    const normalizedStatus = normalizeStatus(status);
    const priority = coercePriority(item.priority);
    const waitingForId = normalizeWaitingList(item.waitingForId);
    const dependencyState = evaluateDependencies(waitingForId, lookup);
    const canExecute =
      dependencyState.complete &&
      !dependencyState.missing &&
      !TERMINAL_STATUSES.has(normalizedStatus);
    const { symbol, color } = resolveStatusDetails(status, {
      canExecute,
      hasMissingDependencies: dependencyState.missing,
    });

    nodes.push({
      id: stableId,
      title,
      status,
      normalizedStatus,
      priority,
      waitingForId,
      waitingLabel: waitingForId.join(', '),
      hasMissingDependencies: dependencyState.missing,
      canExecute,
      symbol,
      color,
      age: coerceAge(item.age),
      commandPreview: buildCommandPreview(item.command),
    });
  });

  nodes.sort((a, b) => {
    if (a.canExecute !== b.canExecute) {
      return a.canExecute ? -1 : 1;
    }

    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    const titleCompare = a.title.localeCompare(b.title);
    if (titleCompare !== 0) {
      return titleCompare;
    }

    return a.id.localeCompare(b.id);
  });

  return nodes;
}

export function buildPlanLines(plan) {
  const nodes = createPlanNodes(plan);
  return nodes.map((node) => {
    const titlePart = node.title ? node.title : '(untitled task)';
    const statusPart = node.status ? `[${node.status}]` : '[pending]';
    const priorityPart = Number.isFinite(node.priority) ? `priority ${node.priority}` : 'priority ∞';
    const idPart = node.id ? `id ${node.id}` : '';
    const agePart = `age ${node.age ?? 0}`;
    const waitingPart =
      node.waitingForId.length > 0
        ? node.hasMissingDependencies
          ? `waiting on ${node.waitingLabel ? `${node.waitingLabel} (missing)` : 'missing tasks'}`
          : `waiting on ${node.waitingLabel}`
        : node.canExecute
        ? 'ready to run'
        : '';
    const commandPart = node.commandPreview ? ` — ${node.commandPreview}` : '';

    const metaParts = [statusPart, priorityPart, agePart];
    if (idPart) {
      metaParts.push(idPart);
    }
    if (waitingPart) {
      metaParts.push(waitingPart);
    }

    return `${node.symbol} ${titlePart} (${metaParts.filter(Boolean).join(', ')})${commandPart}`.trimEnd();
  });
}

export default {
  createPlanNodes,
  buildPlanLines,
};
