import type { AgentRuntimeLike, CliAppProps } from '../types.js';

/**
 * Narrow an optional runtime prop so downstream logic can call methods without
 * re-checking the object shape in every handler.
 */
export function coerceRuntime(runtime: CliAppProps['runtime']): AgentRuntimeLike | null {
  if (!runtime || typeof runtime !== 'object') {
    return null;
  }

  return runtime as AgentRuntimeLike;
}
