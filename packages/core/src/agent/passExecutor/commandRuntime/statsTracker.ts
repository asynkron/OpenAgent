import type { EmitEvent } from '../types.js';
import type { CommandExecution, CommandStatsResult } from './types.js';

export interface CommandStatsDependencies {
  incrementCommandCountFn: (key: string) => Promise<boolean | void>;
  emitEvent: EmitEvent | null | undefined;
}

export const deriveCommandKey = (
  commandPayload: CommandExecution['command'],
  normalizedRun: string,
): string => {
  if (typeof commandPayload.key === 'string') {
    const trimmed = commandPayload.key.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (normalizedRun) {
    const [firstToken] = normalizedRun.split(/\s+/);
    if (firstToken) {
      return firstToken;
    }
  }

  return 'unknown';
};

export const recordCommandStats = async (
  dependencies: CommandStatsDependencies,
  context: CommandExecution,
): Promise<CommandStatsResult> => {
  const key = deriveCommandKey(context.command, context.normalizedRun);

  try {
    await dependencies.incrementCommandCountFn(key);
    return {
      ...context,
      status: 'stats-recorded',
      key,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    dependencies.emitEvent?.({
      type: 'status',
      level: 'warn',
      message: 'Failed to record command usage statistics.',
      details: message,
    });

    return {
      ...context,
      status: 'stats-failed',
      key,
      error: message,
    };
  }
};
