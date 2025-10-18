/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';
import {
  buildPlanObservation,
  createPlanObservationHistoryEntry,
  createCommandRejectionObservation,
} from '../observationRecorder.js';

const samplePlan = [{ id: 'step-1', status: 'pending', command: { run: 'echo hi' } }];

describe('observationRecorder helpers', () => {
  test('buildPlanObservation serializes plan snapshots with metadata', () => {
    const timestamp = new Date('2024-01-01T00:00:00.000Z');
    const observation = buildPlanObservation(samplePlan, timestamp);

    expect(observation.observation_for_llm?.plan).toEqual([{ id: 'step-1', status: 'pending' }]);
    expect(observation.observation_metadata?.timestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  test('createPlanObservationHistoryEntry wraps observations in a chat entry', () => {
    const timestamp = new Date('2024-02-02T02:02:02.000Z');
    const entry = createPlanObservationHistoryEntry({
      activePlan: samplePlan,
      passIndex: 3,
      timestamp,
    });

    expect(entry).toMatchObject({ eventType: 'chat-message', role: 'user', pass: 3 });
    const parsed = JSON.parse(String(entry.content));
    expect(parsed).toMatchObject({ type: 'plan-update' });
    expect(parsed.plan).toEqual([{ id: 'step-1', status: 'pending' }]);
    expect(parsed.metadata.timestamp).toBe('2024-02-02T02:02:02.000Z');
  });

  test('createCommandRejectionObservation marks cancellation', () => {
    const timestamp = new Date('2024-03-03T03:03:03.000Z');
    const observation = createCommandRejectionObservation(timestamp);

    expect(observation.observation_for_llm?.canceled_by_human).toBe(true);
    expect(observation.observation_metadata?.timestamp).toBe('2024-03-03T03:03:03.000Z');
  });
});
