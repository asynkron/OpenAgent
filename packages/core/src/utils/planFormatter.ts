import type { PlanSnapshot, PlanSnapshotStep } from './planCloneUtils.js';

type IdentifierCandidate =
  | PlanSnapshotStep['id']
  | (PlanSnapshotStep['waitingForId'] extends Array<infer U> ? U : never)
  | null
  | undefined;

const normalizePlanIdentifier = (value: IdentifierCandidate): string => {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value).trim();
  return normalized || '';
};

export const planToMarkdown = (plan: PlanSnapshot | null | undefined): string => {
  const header = '# Active Plan\n\n';

  if (!Array.isArray(plan) || plan.length === 0) {
    return `${header}_No active plan._\n`;
  }

  const lines: string[] = [];

  plan.forEach((planItem, index) => {
    if (!planItem || typeof planItem !== 'object') {
      return;
    }

    const title =
      typeof planItem.title === 'string' && planItem.title.trim().length > 0
        ? planItem.title.trim()
        : `Task ${index + 1}`;
    const status = planItem.status ? String(planItem.status).trim() : '';
    const priority = Number.isFinite(Number(planItem.priority)) ? Number(planItem.priority) : null;
    const dependencies = Array.isArray(planItem.waitingForId)
      ? planItem.waitingForId
          .map((value) => normalizePlanIdentifier(value))
          .filter((value) => value.length > 0)
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
