// @ts-nocheck
/* eslint-env jest */
import { summarizePlanForHistory } from '../passExecutor/planRuntime.js';

describe('summarizePlanForHistory', () => {
  test('returns compact plan snapshots that only preserve execution outcome', () => {
    const longRun = 'cat <<\'EOF\' > big-file\n' + 'x'.repeat(5000) + '\nEOF\n';
    const plan = [
      {
        id: 't1',
        title: 'Generate big file',
        status: 'completed',
        waitingForId: ['prep'],
        command: {
          reason: 'Create file with lots of content',
          cwd: '/tmp',
          run: longRun,
          timeout_sec: 30,
        },
        observation: {
          observation_for_llm: {
            stdout: 'wrote big-file\n',
            exit_code: 0,
            truncated: false,
          },
          observation_metadata: {
            timestamp: '2025-01-01T00:00:00.000Z',
          },
        },
      },
      {
        id: 't2',
        status: 'pending',
      },
    ];

    const summary = summarizePlanForHistory(plan);
    expect(summary).toHaveLength(2);

    const [completed, pending] = summary;
    expect(completed).toMatchObject({
      id: 't1',
      status: 'completed',
      stdout: 'wrote big-file\n',
      exit_code: 0,
      truncated: false,
    });
    expect(completed.metadata).toMatchObject({
      timestamp: '2025-01-01T00:00:00.000Z',
    });
    expect(completed).not.toHaveProperty('command');
    expect(completed).not.toHaveProperty('title');
    expect(completed).not.toHaveProperty('waitingForId');

    expect(pending).toMatchObject({
      id: 't2',
      status: 'pending',
    });
  });
});
