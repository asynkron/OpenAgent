// Renders the agent plan timeline and its progress summary inside the chat panel.
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);
const TERMINAL_STATUSES = new Set(['completed', 'complete', 'done', 'finished', 'failed', 'abandoned']);
const ACTIVE_KEYWORDS = ['progress', 'working', 'running', 'executing', 'active', 'doing'];

function normaliseText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function computeStatusState(status) {
  const text = normaliseText(status);
  if (!text) {
    return { label: 'Pending', state: 'pending' };
  }

  const normalised = text.toLowerCase();
  if (COMPLETED_STATUSES.has(normalised) || normalised.startsWith('complete')) {
    return { label: text, state: 'completed' };
  }

  if (normalised === 'failed' || normalised === 'abandoned') {
    return { label: text, state: 'blocked' };
  }

  if (ACTIVE_KEYWORDS.some((keyword) => normalised.includes(keyword)) || normalised === 'running') {
    return { label: text, state: 'active' };
  }

  return { label: text, state: 'pending' };
}

function aggregateProgress(items) {
  let completed = 0;
  let total = 0;

  if (!Array.isArray(items) || items.length === 0) {
    return { completed, total };
  }

  items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    total += 1;
    const normalized = normaliseText(item.status).toLowerCase();
    if (COMPLETED_STATUSES.has(normalized) || normalized.startsWith('complete')) {
      completed += 1;
    }
  });

  return { completed, total };
}

function computePlanProgress(plan) {
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

function normalizeWaitingFor(value) {
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
    const id = normaliseText(item.id);
    if (id && !lookup.has(id)) {
      lookup.set(id, item);
    }
  });

  return lookup;
}

function dependenciesComplete(item, lookup) {
  const waitingForId = normalizeWaitingFor(item.waitingForId);
  if (waitingForId.length === 0) {
    return { waitingForId, complete: true, missing: false };
  }

  let complete = true;
  let missing = false;

  waitingForId.forEach((dependency) => {
    const referenced = lookup.get(dependency);
    if (!referenced) {
      complete = false;
      missing = true;
      return;
    }
    const statusText = normaliseText(referenced.status).toLowerCase();
    if (!COMPLETED_STATUSES.has(statusText) && !statusText.startsWith('complete')) {
      complete = false;
    }
  });

  return { waitingForId, complete, missing };
}

function classifyStep(item, lookup) {
  const statusText = normaliseText(item.status);
  const normalizedStatus = statusText.toLowerCase();
  const dependencyState = dependenciesComplete(item, lookup);
  const canExecute = dependencyState.complete && !dependencyState.missing;

  let state = 'pending';
  if (COMPLETED_STATUSES.has(normalizedStatus) || normalizedStatus.startsWith('complete')) {
    state = 'completed';
  } else if (normalizedStatus === 'failed' || normalizedStatus === 'abandoned') {
    state = 'blocked';
  } else if (normalizedStatus === 'running') {
    state = 'active';
  } else if (!canExecute) {
    state = 'blocked';
  }

  const readinessLabel = dependencyState.waitingForId.length
    ? dependencyState.missing
      ? `Waiting on ${dependencyState.waitingForId.join(', ')} (missing)`
      : `Waiting on ${dependencyState.waitingForId.join(', ')}`
    : canExecute
    ? 'Ready to run'
    : 'Waiting';

  return {
    id: normaliseText(item.id) || '',
    title: normaliseText(item.title) || '(untitled task)',
    statusLabel: statusText || 'Pending',
    priority: Number.isFinite(item.priority) ? item.priority : Number.parseInt(item.priority, 10) || 0,
    state,
    readinessLabel,
    waitingForId: dependencyState.waitingForId,
    hasMissingDependencies: dependencyState.missing,
    canExecute,
  };
}

function sortSteps(plan) {
  const lookup = buildPlanLookup(plan);
  const normalized = [];

  plan.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    normalized.push(classifyStep(item, lookup));
  });

  normalized.sort((a, b) => {
    if (a.canExecute !== b.canExecute) {
      return a.canExecute ? -1 : 1;
    }
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.title.localeCompare(b.title);
  });

  return normalized;
}

function buildSteps(plan) {
  if (!Array.isArray(plan) || plan.length === 0) {
    return null;
  }

  const list = document.createElement('ol');
  list.className = 'agent-plan-steps';

  const normalized = sortSteps(plan);

  normalized.forEach((item) => {
    const step = document.createElement('li');
    step.className = 'agent-plan-step';
    step.classList.add(`agent-plan-step--${item.state}`);

    const mainRow = document.createElement('div');
    mainRow.className = 'agent-plan-step-main';

    const indicator = document.createElement('span');
    indicator.className = 'agent-plan-step-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    mainRow.appendChild(indicator);

    const titleEl = document.createElement('span');
    titleEl.className = 'agent-plan-step-title';
    titleEl.textContent = item.title;
    mainRow.appendChild(titleEl);

    const metaEl = document.createElement('span');
    metaEl.className = 'agent-plan-step-meta';
    const metaParts = [`${item.statusLabel}`, `priority ${item.priority}`];
    if (item.id) {
      metaParts.push(`id ${item.id}`);
    }
    if (item.readinessLabel) {
      metaParts.push(item.readinessLabel);
    }
    metaEl.textContent = metaParts.join(' • ');
    mainRow.appendChild(metaEl);

    step.appendChild(mainRow);

    list.appendChild(step);
  });

  return list;
}

export function createPlanDisplay({ container } = {}) {
  if (!container) {
    return null;
  }

  container.classList.add('agent-plan');

  const header = document.createElement('div');
  header.className = 'agent-plan-header';

  const title = document.createElement('span');
  title.className = 'agent-plan-title';
  title.textContent = 'Active plan';
  header.appendChild(title);

  const summary = document.createElement('span');
  summary.className = 'agent-plan-summary';
  summary.textContent = '';
  header.appendChild(summary);

  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'agent-plan-progress';

  const progressBar = document.createElement('div');
  progressBar.className = 'agent-plan-progress-bar';
  progressWrapper.appendChild(progressBar);
  header.appendChild(progressWrapper);

  const listWrapper = document.createElement('div');
  listWrapper.className = 'agent-plan-list';

  container.appendChild(header);
  container.appendChild(listWrapper);

  const updatePlan = (plan) => {
    const progress = computePlanProgress(plan);
    const summaryText = progress.totalSteps
      ? `${progress.completedSteps}/${progress.totalSteps} completed`
      : 'No active steps yet';
    summary.textContent = summaryText;

    progressBar.style.setProperty('--progress-ratio', String(progress.ratio));
    progressBar.style.width = `${Math.round(progress.ratio * 100)}%`;

    listWrapper.innerHTML = '';
    const stepsList = buildSteps(plan);
    if (stepsList) {
      listWrapper.appendChild(stepsList);
    }
  };

  updatePlan([]);

  return {
    update(plan) {
      updatePlan(plan);
    },
  };
}

export default {
  createPlanDisplay,
};
