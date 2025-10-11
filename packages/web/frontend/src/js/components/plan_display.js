// Renders the agent plan timeline and its progress summary inside the chat panel.
const PLAN_CHILD_KEYS = ['substeps', 'children', 'steps'];
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'finished']);
const ACTIVE_KEYWORDS = ['progress', 'working', 'running', 'executing', 'active', 'doing'];
const BLOCKED_KEYWORDS = ['blocked', 'failed', 'error', 'stuck'];

function normaliseText(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function normaliseStep(step) {
    const text = normaliseText(step);
    if (!text) {
        return '';
    }
    return text.replace(/\.+$/, '');
}

function selectChildKey(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }
    return PLAN_CHILD_KEYS.find((key) => Array.isArray(item[key]) && item[key].length > 0) || null;
}

function determineStepLabel(item, index, ancestors) {
    const explicit = normaliseStep(item?.step);
    if (explicit) {
        return explicit;
    }
    const parts = [...ancestors, String(index + 1)];
    return parts.join('.');
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

    if (BLOCKED_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
        return { label: text, state: 'blocked' };
    }

    if (ACTIVE_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
        return { label: text, state: 'active' };
    }

    if (normalised.includes('pending') || normalised.includes('todo') || normalised.includes('to do')) {
        return { label: text, state: 'pending' };
    }

    return { label: text, state: 'active' };
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
        const childKey = selectChildKey(item);
        if (childKey) {
            const child = aggregateProgress(item[childKey]);
            completed += child.completed;
            total += child.total;
            if (child.total > 0) {
                return;
            }
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

function buildSteps(plan, ancestors = []) {
    if (!Array.isArray(plan) || plan.length === 0) {
        return null;
    }

    const list = document.createElement('ol');
    list.className = 'agent-plan-steps';

    plan.forEach((item, index) => {
        const step = document.createElement('li');
        step.className = 'agent-plan-step';

        if (!item || typeof item !== 'object') {
            return;
        }

        const label = determineStepLabel(item, index, ancestors);
        const title = normaliseText(item.title);
        const statusInfo = computeStatusState(item.status);
        step.classList.add(`agent-plan-step--${statusInfo.state}`);

        const mainRow = document.createElement('div');
        mainRow.className = 'agent-plan-step-main';

        const indicator = document.createElement('span');
        indicator.className = 'agent-plan-step-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        mainRow.appendChild(indicator);

        const labelEl = document.createElement('span');
        labelEl.className = 'agent-plan-step-label';
        labelEl.textContent = label;
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

        const childKey = selectChildKey(item);
        if (childKey) {
            const childList = buildSteps(item[childKey], label.split('.'));
            if (childList) {
                step.appendChild(childList);
            }
        }

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

    container.appendChild(header);
    container.appendChild(progressWrapper);
    container.appendChild(stepsContainer);

    let currentPlan = null;

    function update(plan) {
        const validPlan = Array.isArray(plan) ? plan : [];
        currentPlan = validPlan;

        if (validPlan.length === 0) {
            container.classList.add('hidden');
            stepsContainer.innerHTML = '';
            summary.textContent = '';
            progressFill.style.width = '0%';
            progressBar.setAttribute('aria-valuenow', '0');
            progressBar.setAttribute('aria-valuetext', 'No steps planned');
            progressLabel.textContent = 'No steps planned yet';
            return;
        }

        container.classList.remove('hidden');

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

    function reset() {
        update([]);
        currentPlan = null;
    }

    reset();

    const api = {
        update,
        reset,
        getPlan: () => currentPlan,
    };

    // Expose the API on the container to simplify debugging in the browser console.
    container.__planDisplay = api;

    return api;
}
