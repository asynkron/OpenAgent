/* eslint-env jest */
import {
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
  formatObservationMessage,
} from '../historyMessageBuilder.js';

describe('historyMessageBuilder', () => {
  test('creates an assistant entry for command observations', () => {
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
    });

    expect(entry.role).toBe('assistant');
    expect(entry.content).toContain('I ran the command: echo hello.');
    expect(entry.content).toContain('Structured payload:');
    expect(entry.content).toContain('"stdout": "hello\\n"');
    expect(entry.content).toContain('Metadata:');
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

    expect(message).toContain('failed schema validation');
    expect(message).toContain('Message: Schema validation failed.');
    expect(message).toContain('"schema_validation_error": true');
    expect(message).toContain('"command is required"');
  });

  test('wraps plan reminder auto responses', () => {
    const planReminderMessage = 'Please continue executing the outstanding plan steps.';
    const entry = createPlanReminderEntry(planReminderMessage);

    expect(entry.role).toBe('assistant');
    expect(entry.content).toContain('unfinished steps in the active plan');
    expect(entry.content).toContain('Auto-response content:');
    expect(entry.content).toContain(planReminderMessage);
  });

  test('wraps refusal auto responses', () => {
    const entry = createRefusalAutoResponseEntry('continue');

    expect(entry.role).toBe('assistant');
    expect(entry.content).toContain('appeared to be a refusal');
    expect(entry.content).toContain('Auto-response content:');
    expect(entry.content).toContain('continue');
  });
});
