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
    expect(isCompletedStatus(COMPLETED_STATUS)).toBe(true);
    expect(isFailedStatus(FAILED_STATUS)).toBe(true);
    expect(isAbandonedStatus(ABANDONED_STATUS)).toBe(true);
    expect(isCompletedStatus(null)).toBe(false);
  });

  test('flags terminal statuses consistently', () => {
    expect(isTerminalStatus(COMPLETED_STATUS)).toBe(true);
    expect(isTerminalStatus(FAILED_STATUS)).toBe(true);
    expect(isTerminalStatus(ABANDONED_STATUS)).toBe(true);
    expect(isTerminalStatus(PENDING_STATUS)).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });
});
