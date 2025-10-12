// Renders the agent plan timeline and its progress summary inside the chat panel.
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);
const ACTIVE_KEYWORDS = ['progress', 'working', 'running', 'executing', 'active', 'doing'];
const BLOCKED_KEYWORDS = ['blocked', 'failed', 'error', 'stuck'];
const TERMINAL_STATUSES = new Set(['completed', 'complete', 'done', 'finished', 'failed']);

type PlanStep = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: number | string | null;
  waitingForId?: Array<string | null | undefined> | null;
};

type DecoratedPlanEntry = {
  item: PlanStep;
  waitingFor: string[];
  blocked: boolean;
  priority: number;
  index: number;
};

type PlanProgress = {
  completedSteps: number;
  remainingSteps: number;
  totalSteps: number;
  ratio: number;
};

type NormalisedStatus = {
  label: string;
  state: 'blocked' | 'pending' | 'completed' | 'active';
};

type PlanDisplayApi = {
  update(plan: PlanStep[] | null | undefined): void;
  reset(): void;
  getPlan(): PlanStep[] | null;
};

type PlanDisplayOptions = {
  container: HTMLElement | null;
};

interface PlanDisplayHost extends HTMLElement {
  __planDisplay?: PlanDisplayApi;
}

function normaliseText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function computeStatusState(status: unknown, blocked: boolean): NormalisedStatus {
  const text = normaliseText(status);

  if (blocked) {
    const label = text || 'Waiting on dependencies';
    return { label, state: 'blocked' };
  }

  if (!text) {
    return { label: 'Pending', state: 'pending' };
  }

  const normalised = text.toLowerCase();
  if (COMPLETED_STATUSES.has(normalised) || normalised.startsWith('complete')) {
    return { label: text, state: 'completed' };
  }

  if (BLOCKED_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
    return { label: text, state: 'blocked' };
  }

  if (ACTIVE_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
    return { label: text, state: 'active' };
  }

  if (
    normalised.includes('pending') ||
    normalised.includes('todo') ||
    normalised.includes('to do')
  ) {
    return { label: text, state: 'pending' };
  }

  return { label: text, state: 'active' };
}

function normalizeId(value: unknown): string {
  const text = normaliseText(value);
  return text;
}

function dependenciesFor(step: PlanStep | null | undefined): string[] {
  if (!step || typeof step !== 'object' || !Array.isArray(step.waitingForId)) {
    return [];
  }

  return step.waitingForId
    .map((value) => normalizeId(value))
    .filter((value): value is string => value.length > 0);
}

function buildPlanLookup(plan: PlanStep[] | null | undefined): Map<string, PlanStep> {
  const lookup = new Map<string, PlanStep>();

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

function isTerminalStatus(status: unknown): boolean {
  if (typeof status !== 'string') {
    return false;
  }

  const normalized = status.trim().toLowerCase();
  return TERMINAL_STATUSES.has(normalized) || normalized.startsWith('complete');
}

function isStepBlocked(step: PlanStep | null | undefined, lookup: Map<string, PlanStep>): boolean {
  const dependencies = dependenciesFor(step);
  if (dependencies.length === 0) {
    return false;
  }

  if (lookup.size === 0) {
    return true;
  }

  for (const dependencyId of dependencies) {
    const dependency = lookup.get(dependencyId);
    if (!dependency || !isTerminalStatus(dependency.status)) {
      return true;
    }
  }

  return false;
}

function parsePriority(value: PlanStep['priority']): number {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function decoratePlan(plan: PlanStep[] | null | undefined): DecoratedPlanEntry[] {
  if (!Array.isArray(plan)) {
    return [];
  }

  const lookup = buildPlanLookup(plan);

  return plan
    .map<DecoratedPlanEntry | null>((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const waitingFor = dependenciesFor(item);
      const blocked = isStepBlocked(item, lookup);
      const priority = parsePriority(item.priority);

      return {
        item,
        waitingFor,
        blocked,
        priority,
        index,
      };
    })
    .filter((entry): entry is DecoratedPlanEntry => Boolean(entry))
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

function aggregateProgress(items: PlanStep[] | null | undefined): {
  completed: number;
  total: number;
} {
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
    const statusText = normaliseText(item.status);
    const normalized = statusText.toLowerCase();
    if (COMPLETED_STATUSES.has(normalized) || normalized.startsWith('complete')) {
      completed += 1;
    }
  });

  return { completed, total };
}

function computePlanProgress(plan: PlanStep[] | null | undefined): PlanProgress {
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

function buildSteps(plan: PlanStep[] | null | undefined): HTMLOListElement | null {
  const decorated = decoratePlan(plan);
  if (decorated.length === 0) {
    return null;
  }

  const list = document.createElement('ol');
  list.className = 'agent-plan-steps';

  decorated.forEach((entry, order) => {
    const { item, blocked, waitingFor, priority } = entry;
    const step = document.createElement('li');
    step.className = 'agent-plan-step';

    const title = normaliseText(item.title);
    const statusInfo = computeStatusState(item.status, blocked);
    step.classList.add(`agent-plan-step--${statusInfo.state}`);

    const mainRow = document.createElement('div');
    mainRow.className = 'agent-plan-step-main';

    const indicator = document.createElement('span');
    indicator.className = 'agent-plan-step-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    mainRow.appendChild(indicator);

    const labelEl = document.createElement('span');
    labelEl.className = 'agent-plan-step-label';
    labelEl.textContent = String(order + 1);
    mainRow.appendChild(labelEl);

    if (title) {
      const titleEl = document.createElement('span');
      titleEl.className = 'agent-plan-step-title';
      titleEl.textContent = title;
      mainRow.appendChild(titleEl);
    }

    step.appendChild(mainRow);

    if (statusInfo.label) {
      const statusEl = document.createElement('div');
      statusEl.className = 'agent-plan-step-status';
      statusEl.textContent = statusInfo.label;
      step.appendChild(statusEl);
    }

    const metaParts: string[] = [];
    if (Number.isFinite(priority)) {
      metaParts.push(`Priority ${priority}`);
    }
    if (waitingFor.length > 0) {
      metaParts.push(`Waiting for ${waitingFor.join(', ')}`);
    }

    if (metaParts.length > 0) {
      const metaEl = document.createElement('div');
      metaEl.className = 'agent-plan-step-meta';
      metaEl.textContent = metaParts.join(' • ');
      step.appendChild(metaEl);
    }

    list.appendChild(step);
  });

  return list;
}

export function createPlanDisplay({ container }: PlanDisplayOptions = { container: null }): PlanDisplayApi | null {
  if (!container) {
    return null;
  }

  const host = container as PlanDisplayHost;
  host.classList.add('agent-plan');

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
  progressBar.setAttribute('role', 'progressbar');
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', '100');

  const progressFill = document.createElement('div');
  progressFill.className = 'agent-plan-progress-fill';
  progressBar.appendChild(progressFill);

  const progressLabel = document.createElement('span');
  progressLabel.className = 'agent-plan-progress-label';
  progressLabel.textContent = '';

  progressWrapper.appendChild(progressBar);
  progressWrapper.appendChild(progressLabel);

  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'agent-plan-steps-container';

  host.appendChild(header);
  host.appendChild(progressWrapper);
  host.appendChild(stepsContainer);

  let currentPlan: PlanStep[] | null = null;

  function update(plan: PlanStep[] | null | undefined): void {
    const validPlan = Array.isArray(plan) ? plan : [];
    currentPlan = validPlan;

    if (validPlan.length === 0) {
      host.classList.add('hidden');
      stepsContainer.innerHTML = '';
      summary.textContent = '';
      progressFill.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', '0');
      progressBar.setAttribute('aria-valuetext', 'No steps planned');
      progressLabel.textContent = 'No steps planned yet';
      return;
    }

    host.classList.remove('hidden');

    const list = buildSteps(validPlan);
    stepsContainer.innerHTML = '';
    if (list) {
      stepsContainer.appendChild(list);
    }

    const progress = computePlanProgress(validPlan);
    const percentage = Math.round(progress.ratio * 100);
    progressFill.style.width = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', String(percentage));
    progressBar.setAttribute('aria-valuetext', `${percentage}% complete`);
    const completedWord = progress.totalSteps === 1 ? 'step' : 'steps';
    progressLabel.textContent = `${progress.completedSteps} of ${progress.totalSteps} ${completedWord} complete`;
    if (progress.remainingSteps > 0) {
      const remainingWord = progress.remainingSteps === 1 ? 'step' : 'steps';
      summary.textContent = `${progress.remainingSteps} ${remainingWord} remaining`;
    } else {
      summary.textContent = 'All steps completed';
    }
  }

  function reset(): void {
    update([]);
    currentPlan = null;
  }

  reset();

  const api: PlanDisplayApi = {
    update,
    reset,
    getPlan(): PlanStep[] | null {
      return currentPlan;
    },
  };

  host.__planDisplay = api;

  return api;
}

export type { PlanDisplayApi, PlanStep };
