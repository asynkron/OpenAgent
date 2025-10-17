/* eslint-env jest */
import {
  isAbandonedStatus,
  isCompletedStatus,
  isFailedStatus,
  isTerminalStatus,
} from '../planStatusUtils.js';
import {
  ABANDONED_STATUS,
  COMPLETED_STATUS,
  FAILED_STATUS,
  PENDING_STATUS,
} from '../planStatusTypes.js';

describe('planStatusUtils', () => {
  test('detects canonical completion states', () => {
    // These helpers normalize unknown inputs before comparison, so we check the
    // happy paths and a stray casing that should still pass.
    expect(isCompletedStatus(COMPLETED_STATUS)).toBe(true);
    expect(isCompletedStatus('Completed')).toBe(true);
    expect(isFailedStatus(FAILED_STATUS)).toBe(true);
    expect(isAbandonedStatus(ABANDONED_STATUS)).toBe(true);
  });

  test('flags terminal statuses consistently', () => {
    // Terminal status check should accept both completion paths while rejecting
    // pending or malformed values so plan math does not regress.
    expect(isTerminalStatus(COMPLETED_STATUS)).toBe(true);
    expect(isTerminalStatus(FAILED_STATUS)).toBe(true);
    expect(isTerminalStatus(ABANDONED_STATUS)).toBe(true);
    expect(isTerminalStatus(PENDING_STATUS)).toBe(false);
    expect(isTerminalStatus('unknown')).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });
});
