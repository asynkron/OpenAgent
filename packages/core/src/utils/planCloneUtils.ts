const hasStructuredClone = typeof globalThis.structuredClone === 'function';

export const deepCloneValue = <T>(value: T): T => {
  if (hasStructuredClone) {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON fallback.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // As a last resort return the original reference.
    return value;
  }
};

export interface PlanItem {
  id?: string | number;
  title?: string;
  status?: string;
  command?: unknown;
  waitingForId?: unknown[];
  [key: string]: unknown;
}

export const clonePlanTree = (plan: unknown): PlanItem[] => {
  if (!Array.isArray(plan)) {
    return [];
  }

  const cloned = deepCloneValue(plan);
  return Array.isArray(cloned) ? cloned : [];
};
