/**
 * Plan utilities extracted from the agent loop.
 */

export function planHasOpenSteps(plan) {
  const hasOpen = (items) => {
    if (!Array.isArray(items)) {
      return false;
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const normalizedStatus =
        typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';

      if (Array.isArray(item.substeps) && hasOpen(item.substeps)) {
        return true;
      }

      if (normalizedStatus !== 'completed') {
        return true;
      }
    }

    return false;
  };

  return hasOpen(plan);
}

export default {
  planHasOpenSteps,
};
