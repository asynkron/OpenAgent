import type { StatusRuntimeEvent } from './runtimeTypes.js';
import type { EmitStatusFn } from './planManager.js';

export interface PlanManagerStatusMessenger {
  info(message: string): void;
  warn(message: string, details?: string): void;
}

const createStatusEvent = (
  level: string,
  message: string,
  details?: string,
): StatusRuntimeEvent => {
  if (typeof details === 'string') {
    return { type: 'status', level, message, details };
  }

  return { type: 'status', level, message };
};

export const createPlanManagerStatusMessenger = (
  emitStatus: EmitStatusFn,
): PlanManagerStatusMessenger => {
  return {
    info(message: string) {
      emitStatus(createStatusEvent('info', message));
    },
    warn(message: string, details?: string) {
      emitStatus(createStatusEvent('warn', message, details));
    },
  };
};
