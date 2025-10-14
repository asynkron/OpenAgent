// @ts-nocheck
/* eslint-env jest */
import {
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
  formatObservationMessage,
} from '../historyMessageBuilder.js';

describe('historyMessageBuilder', () => {
  test('creates a user entry for command observations', () => {
    const observation = {
      observation_for_llm: {
        stdout: 'hello\n',
        stderr: '',
        exit_code: 0,
        truncated: false,
      },
      observation_metadata: {
        timestamp: '2025-01-01T00:00:00.000Z',
      },
    };

    const entry = createObservationHistoryEntry({
      observation,
      command: { run: 'echo hello' },
      pass: 5,
    });

    expect(entry).toMatchObject({ eventType: 'chat-message', role: 'user', pass: 5 });
    expect(entry.payload).toEqual({ role: 'user', content: entry.content });

    const parsed = JSON.parse(entry.content);
    expect(parsed).toMatchObject({
      type: 'observation',
      summary: 'I executed the approved command from the active plan. It finished with exit code 0.',
    });
    expect(parsed.payload).toMatchObject({ stdout: 'hello\n', exit_code: 0 });
    expect(parsed.metadata).toMatchObject({ timestamp: '2025-01-01T00:00:00.000Z' });
  });

  test('includes error messaging for schema validation failures', () => {
    const observation = {
      observation_for_llm: {
        schema_validation_error: true,
        message: 'Schema validation failed.',
        details: ['command is required'],
      },
      observation_metadata: {
        timestamp: '2025-01-01T00:00:00.000Z',
      },
    };

    const message = formatObservationMessage({ observation });

    expect(message).toMatchObject({
      type: 'observation',
      summary: 'The previous assistant response failed schema validation.',
      details: 'Schema validation failed.',
    });
    expect(message.payload).toMatchObject({ schema_validation_error: true });
    expect(message.payload.details).toContain('command is required');
  });

  test('serializes plan updates as structured JSON', () => {
    const observation = {
      observation_for_llm: {
        plan: [{ id: 'task-1', title: 'Do the thing', status: 'running' }],
      },
      observation_metadata: {
        timestamp: '2025-01-01T00:00:00.000Z',
      },
    };

    const entry = createObservationHistoryEntry({ observation, pass: 9 });
    expect(entry).toMatchObject({ eventType: 'chat-message', role: 'user', pass: 9 });
    expect(entry.payload).toEqual({ role: 'user', content: entry.content });
    const parsed = JSON.parse(entry.content);
    expect(parsed).toMatchObject({ type: 'plan-update' });
    expect(parsed.plan).toEqual([{ id: 'task-1', title: 'Do the thing', status: 'running' }]);
    expect(parsed.metadata).toMatchObject({ timestamp: '2025-01-01T00:00:00.000Z' });
  });

  test('wraps plan reminder auto responses', () => {
    const planReminderMessage = 'Please continue executing the outstanding plan steps.';
    const entry = createPlanReminderEntry({ planReminderMessage, pass: 4 });

    expect(entry).toMatchObject({ eventType: 'chat-message', role: 'assistant', pass: 4 });
    expect(entry.payload).toEqual({ role: 'assistant', content: entry.content });
    const parsed = JSON.parse(entry.content);
    expect(parsed).toMatchObject({ type: 'plan-reminder' });
    expect(parsed.message).toContain('unfinished steps in the active plan');
    expect(parsed.auto_response).toBe(planReminderMessage);
  });

  test('wraps refusal auto responses', () => {
    const entry = createRefusalAutoResponseEntry({ autoResponseMessage: 'continue', pass: 12 });

    expect(entry).toMatchObject({ eventType: 'chat-message', role: 'assistant', pass: 12 });
    expect(entry.payload).toEqual({ role: 'assistant', content: entry.content });
    const parsed = JSON.parse(entry.content);
    expect(parsed).toMatchObject({ type: 'refusal-reminder' });
    expect(parsed.message).toContain('appeared to be a refusal');
    expect(parsed.auto_response).toBe('continue');
  });
});
