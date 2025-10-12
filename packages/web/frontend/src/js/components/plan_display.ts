// Renders the agent plan timeline and its progress summary inside the chat panel.
import {
  computePlanProgress,
  computeStatusState,
  decoratePlan,
  normaliseText,
  summariseProgress,
  type PlanStep,
} from './plan_model.js';

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

    const summaryText = summariseProgress(progress);
    progressBar.setAttribute('aria-valuetext', summaryText);
    const [completedText, remainingText = ''] = summaryText.split(' • ');
    progressLabel.textContent = completedText;
    summary.textContent = remainingText;
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
export type {
  DecoratedPlanEntry,
  NormalisedStatus,
  PlanProgress,
  PlanStatusState,
} from './plan_model.js';
