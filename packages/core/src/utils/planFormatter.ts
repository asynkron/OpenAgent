import type { PlanItem, PlanTree } from './planCloneUtils.js';

const normalizePlanIdentifier = (value: string | number | null | undefined): string => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim() || '';
};

export const planToMarkdown = (plan: PlanTree | null | undefined): string => {
  const header = '# Active Plan\n\n';

  if (!Array.isArray(plan) || plan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines: string[] = [];

  plan.forEach((item, index) => {
    const planItem = item as PlanItem;
    const title = planItem.title.trim().length > 0 ? planItem.title.trim() : `Task ${index + 1}`;
    const status = planItem.status.trim();
    const priority = Number.isFinite(Number(planItem.priority)) ? Number(planItem.priority) : null;
    const dependencies = planItem.waitingForId
      .map((value) => normalizePlanIdentifier(value))
      .filter((value): value is string => Boolean(value));

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
