import type { PlanSnapshotStep } from './planCloneUtils.js';

const normalizePlanIdentifier = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim() || '';
};

export const planToMarkdown = (plan: unknown): string => {
  const header = '# Active Plan\n\n';

  if (!Array.isArray(plan) || plan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines: string[] = [];

  plan.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const planItem = item as PlanSnapshotStep;
    const title =
      typeof planItem.title === 'string' && planItem.title.trim().length > 0
        ? planItem.title.trim()
        : `Task ${index + 1}`;
    const status =
      typeof planItem.status === 'string' && planItem.status.trim().length > 0
        ? planItem.status.trim()
        : '';
    const priority = Number.isFinite(Number(planItem.priority)) ? Number(planItem.priority) : null;
    const dependencies = Array.isArray(planItem.waitingForId)
      ? planItem.waitingForId
          .filter((value) => normalizePlanIdentifier(value))
          .map((value) => String(value).trim())
      : [];

    const details: string[] = [];
    if (priority !== null) {
      details.push(`priority ${priority}`);
    }
    if (dependencies.length > 0) {
      details.push(`waiting for ${dependencies.join(', ')}`);
    }

    const detailsText = details.length > 0 ? ` (${details.join(', ')})` : '';
    const statusText = status ? ` [${status}]` : '';

    lines.push(`Step ${index + 1} - ${title}${statusText}${detailsText}`);
  });

  if (lines.length === 0) {
    return `${header}_No active plan._\n`;
  }

  return `${header}${lines.join('\n')}\n`;
};
