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

  test('createPlanCommandPayload builds placeholder payloads for pending steps', () => {
    const planStep: PlanStep = { id: 'alpha', status: 'pending', command: { run: 'pwd' } };

    const placeholder = createPlanCommandPayload(planStep);

    expect(placeholder).not.toBeNull();
    expect(placeholder?.eventId).toBe('plan-step:alpha');
    expect(placeholder?.command).toEqual({ run: 'pwd' });
    expect(placeholder?.result).toBeNull();
    expect(placeholder?.preview).toBeNull();
    expect(placeholder?.observation).toBeNull();
  });

  test('createPlanCommandPayload builds placeholders for running steps', () => {
    const planStep: PlanStep = { id: 'bravo', status: 'running', command: { run: 'ls' } };

    const placeholder = createPlanCommandPayload(planStep);

    expect(placeholder).not.toBeNull();
    expect(placeholder?.eventId).toBe('plan-step:bravo');
    expect(placeholder?.command).toEqual({ run: 'ls' });
  });

  test('createPlanCommandPayload skips terminal plan steps to preserve execution output', () => {
    const completedStep: PlanStep = { id: 'omega', status: 'completed', command: { run: 'ls' } };

    const placeholder = createPlanCommandPayload(completedStep);

    expect(placeholder).toBeNull();
  });

  test('createPlanCommandPayload skips unrecognized statuses to avoid wiping output', () => {
    const blockedStep: PlanStep = { id: 'zeta', status: 'blocked', command: { run: 'pwd' } };

    const placeholder = createPlanCommandPayload(blockedStep);

    expect(placeholder).toBeNull();
  });
});
