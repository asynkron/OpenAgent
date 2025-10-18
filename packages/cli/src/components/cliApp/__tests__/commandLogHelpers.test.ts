import { createCommandResultPayload, createPlanCommandPayload } from '../commandLogHelpers.js';
import type { CommandResultRuntimeEvent } from '../types.js';
import type { PlanStep } from '../../planUtils.js';

describe('commandLogHelpers', () => {
  test('createCommandResultPayload prefers plan step identifier for event id', () => {
    const event: CommandResultRuntimeEvent = {
      type: 'command-result',
      __id: 'event-123',
      payload: {
        command: { run: 'echo "hello"' },
        result: null,
        preview: null,
        execution: null,
        observation: null,
        planStep: { id: 'step-42', command: { run: 'echo "hello"' } },
        planSnapshot: null,
      },
    };

    const payload = createCommandResultPayload(event);

    expect(payload.eventId).toBe('plan-step:step-42');
    expect(payload.command).toEqual({ run: 'echo "hello"' });
    expect(payload.planStep).toEqual({ id: 'step-42', command: { run: 'echo "hello"' } });
  });

  test('createCommandResultPayload falls back to runtime id when plan step id missing', () => {
    const event: CommandResultRuntimeEvent = {
      type: 'command-result',
      __id: 'event-7',
      payload: {
        command: { run: 'ls' },
        result: null,
        preview: null,
        execution: null,
        observation: null,
        planStep: { command: { run: 'ls' } },
        planSnapshot: null,
      },
    };

    const payload = createCommandResultPayload(event);

    expect(payload.eventId).toBe('event-7');
    expect(payload.command).toEqual({ run: 'ls' });
  });

  test('createPlanCommandPayload builds placeholder payloads without execution output', () => {
    const planStep: PlanStep = { id: 'alpha', command: { run: 'pwd' } };

    const placeholder = createPlanCommandPayload(planStep);

    expect(placeholder).not.toBeNull();
    expect(placeholder?.eventId).toBe('plan-step:alpha');
    expect(placeholder?.command).toEqual({ run: 'pwd' });
    expect(placeholder?.result).toBeNull();
    expect(placeholder?.preview).toBeNull();
    expect(placeholder?.observation).toBeNull();
  });
});
