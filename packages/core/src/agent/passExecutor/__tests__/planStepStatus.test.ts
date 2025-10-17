/* eslint-env jest */
import {
  COMPLETED_STATUS,
  FAILED_STATUS,
  PENDING_STATUS,
  RUNNING_STATUS,
  hasPendingWork,
  normalizeAssistantMessage,
  isCompletedStatus as reExportedIsCompletedStatus,
  isTerminalStatus as reExportedIsTerminalStatus,
} from '../planStepStatus.js';
import {
  isCompletedStatus,
  isTerminalStatus,
} from '../../../utils/planStatusUtils.js';

describe('planStepStatus', () => {
  test('re-exports consolidated status helpers', () => {
    // The module should surface the shared helpers so existing imports stay intact.
    expect(reExportedIsCompletedStatus).toBe(isCompletedStatus);
    expect(reExportedIsTerminalStatus).toBe(isTerminalStatus);
  });

  test('identifies remaining work based on terminal statuses', () => {
    // Pending and running steps still require attention, while completed/failed ones do not.
    expect(hasPendingWork({ status: PENDING_STATUS })).toBe(true);
    expect(hasPendingWork({ status: RUNNING_STATUS })).toBe(true);
    expect(hasPendingWork({ status: COMPLETED_STATUS })).toBe(false);
    expect(hasPendingWork({ status: FAILED_STATUS })).toBe(false);
  });

  test('normalizes assistant messages for downstream heuristics', () => {
    // Smart quotes appear frequently in LLM responses; the helper keeps comparisons simple.
    expect(normalizeAssistantMessage("It’s done")).toBe("It's done");
    expect(normalizeAssistantMessage(42)).toBe('');
  });
});
