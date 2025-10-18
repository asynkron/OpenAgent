import type { CommandResultRuntimeEvent } from './types.js';
import { cloneValue } from './runtimeUtils.js';
import type { PlanStep } from '../planUtils.js';
import type {
  Command as CommandPayload,
  CommandExecution,
  CommandPreview,
  CommandResult,
} from '../commandUtils.js';

interface CommandTimelinePayload {
  readonly command: CommandPayload | null;
  readonly result: CommandResult | null;
  readonly preview: CommandPreview | null;
  readonly execution: CommandExecution | null;
  readonly planStep: PlanStep | null;
}

interface NormalisedCommandEvent {
  readonly command: CommandPayload | null;
  readonly timelinePayload: CommandTimelinePayload;
}

/**
 * Clones runtime command events once so the hook can reuse the results safely.
 */
export function normaliseCommandResultEvent(
  event: CommandResultRuntimeEvent,
): NormalisedCommandEvent {
  const command = cloneValue(event.command ?? null) as CommandPayload | null;

  return {
    command,
    timelinePayload: {
      command,
      result: cloneValue(event.result ?? null) as CommandResult | null,
      preview: cloneValue(event.preview ?? null) as CommandPreview | null,
      execution: cloneValue(event.execution ?? null) as CommandExecution | null,
      planStep: cloneValue(event.planStep ?? null) as PlanStep | null,
    },
  };
}
