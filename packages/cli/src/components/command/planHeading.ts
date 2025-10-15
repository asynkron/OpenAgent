import type { PlanStep } from '../planUtils.js';

/**
 * Builds a human-friendly heading for the originating plan step when command
 * output is rendered inside the macOS-style chrome.
 */
export function buildPlanStepHeading(planStep: PlanStep | null | undefined): string | null {
  if (!planStep || typeof planStep !== 'object') {
    return null;
  }

  const idValue = planStep.id;
  const titleValue = planStep.title;

  const idText =
    typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue).trim() : '';
  const titleText = typeof titleValue === 'string' ? titleValue.trim() : '';

  if (idText && titleText) {
    return `#${idText} — ${titleText}`;
  }
  if (idText) {
    return `#${idText}`;
  }
  if (titleText) {
    return titleText;
  }

  return null;
}
