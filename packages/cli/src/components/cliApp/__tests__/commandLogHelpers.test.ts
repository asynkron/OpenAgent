import { createCommandResultPayload } from '../commandLogHelpers.js';
import type { CommandResultRuntimeEvent } from '../types.js';

describe('commandLogHelpers', () => {
  test('createCommandResultPayload prefers runtime event identifier for timeline id', () => {
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

    expect(payload.eventId).toBe('event-123');
    expect(payload.command).toEqual({ run: 'echo "hello"' });
    expect(payload.planStep).toEqual({ id: 'step-42', command: { run: 'echo "hello"' } });
  });

  test('createCommandResultPayload falls back to plan step identifier when runtime id missing', () => {
    const event: CommandResultRuntimeEvent = {
      type: 'command-result',
      __id: undefined,
      payload: {
        command: { run: 'ls' },
        result: null,
        preview: null,
        execution: null,
        observation: null,
        planStep: { id: 'step-7', command: { run: 'ls' } },
        planSnapshot: null,
      },
    };

    const payload = createCommandResultPayload(event);

    expect(payload.eventId).toBe('plan-step:step-7');
    expect(payload.command).toEqual({ run: 'ls' });
  });

  test('createCommandResultPayload preserves plan snapshot observation summary when present', () => {
    const event: CommandResultRuntimeEvent = {
      type: 'command-result',
      __id: 'event-8',
      payload: {
        command: { run: 'ls' },
        result: null,
        preview: null,
        execution: null,
        observation: null,
        planStep: { id: 'step-1', command: { run: 'ls' } },
        planSnapshot: { summary: 'Listed files' },
      },
    };

    const payload = createCommandResultPayload(event);

    expect(payload.observation).toBe('Listed files');
  });
});
