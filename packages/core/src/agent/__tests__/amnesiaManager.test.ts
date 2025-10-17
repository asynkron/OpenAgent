import { AmnesiaManager, applyDementiaPolicy } from '../amnesiaManager.js';
import {
  createChatMessageEntry,
  type ChatMessageEntry,
} from '../historyEntry.js';
import { PlanStatus } from '../../contracts/index.js';
import {
  DEFAULT_COMMAND_MAX_BYTES,
  DEFAULT_COMMAND_TAIL_LINES,
} from '../../constants.js';

interface BuildEntryOptions {
  pass: number;
  role?: 'system' | 'user' | 'assistant';
  content?: string;
}

const buildHistoryEntry = ({
  pass,
  role = 'assistant',
  content = 'content',
}: BuildEntryOptions): ChatMessageEntry =>
  createChatMessageEntry({ eventType: 'chat-message', role, pass, content });

describe('AmnesiaManager', () => {

  it('removes plan update entries older than the threshold', () => {
    const history = [
      createChatMessageEntry({
        eventType: 'chat-message',
        role: 'system',
        pass: 0,
        content: 'system',
      }),
      buildHistoryEntry({
        pass: 1,
        content: JSON.stringify({ type: 'plan-update', message: 'latest', plan: [] }, null, 2),
      }),
      buildHistoryEntry({ pass: 11, content: JSON.stringify({ type: 'note' }, null, 2) }),
    ];

    const manager = new AmnesiaManager({ threshold: 5 });
    const changed = manager.apply({ history, currentPass: 12 });

    expect(changed).toBe(true);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('system');
    expect(history[1].pass).toBe(11);
  });

  it('strips plan payloads from older assistant messages without removing them entirely', () => {
    const history = [
      buildHistoryEntry({
        pass: 2,
        content: JSON.stringify(
          {
            type: 'observation',
            plan: [
              {
                id: 'step-1',
                title: 'first',
                status: PlanStatus.Pending,
                waitingForId: [],
                observation: null,
                priority: null,
                command: {
                  reason: '',
                  shell: '',
                  run: 'echo hi',
                  cwd: '.',
                  timeout_sec: 60,
                  filter_regex: '',
                  tail_lines: DEFAULT_COMMAND_TAIL_LINES,
                  max_bytes: DEFAULT_COMMAND_MAX_BYTES,
                },
              },
            ],
          },
          null,
          2,
        ),
      }),
      buildHistoryEntry({ pass: 9, content: JSON.stringify({ type: 'observation' }, null, 2) }),
    ];

    const manager = new AmnesiaManager({ threshold: 7 });
    const changed = manager.apply({ history, currentPass: 15 });

    expect(changed).toBe(true);
    expect(history).toHaveLength(2);

    const updatedEntry = JSON.parse(history[0].content);
    expect(updatedEntry.plan).toBeUndefined();
    expect(updatedEntry.type).toBe('observation');
  });

  it('ignores entries that cannot be parsed as JSON', () => {
    const history = [
      buildHistoryEntry({ pass: 1, content: 'not-json' }),
      buildHistoryEntry({ pass: 15, content: JSON.stringify({ type: 'note' }, null, 2) }),
    ];

    const manager = new AmnesiaManager({ threshold: 10 });
    const changed = manager.apply({ history, currentPass: 25 });

    expect(changed).toBe(false);
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe('not-json');
  });

  it('never alters system messages even if they are older than the threshold', () => {
    const history = [
      createChatMessageEntry({
        eventType: 'chat-message',
        role: 'system',
        pass: 0,
        content: 'system',
      }),
      buildHistoryEntry({
        pass: 1,
        content: JSON.stringify({ type: 'plan-update', message: 'latest', plan: [] }, null, 2),
      }),
    ];

    const manager = new AmnesiaManager({ threshold: 1 });
    manager.apply({ history, currentPass: 50 });

    expect(history[0].role).toBe('system');
  });
});

describe('applyDementiaPolicy', () => {
  it('removes entries older than the configured limit', () => {
    const history = [
      createChatMessageEntry({
        eventType: 'chat-message',
        role: 'system',
        pass: 0,
        content: 'system',
      }),
      buildHistoryEntry({ pass: 5 }),
      buildHistoryEntry({ pass: 25 }),
      buildHistoryEntry({ pass: 40 }),
    ];

    const changed = applyDementiaPolicy({ history, currentPass: 45, limit: 20 });

    expect(changed).toBe(true);
    expect(history).toEqual([
      createChatMessageEntry({
        eventType: 'chat-message',
        role: 'system',
        pass: 0,
        content: 'system',
      }),
      buildHistoryEntry({ pass: 25 }),
      buildHistoryEntry({ pass: 40 }),
    ]);
  });

  it('can remove system messages when preserveSystemMessages is false', () => {
    const history = [
      createChatMessageEntry({
        eventType: 'chat-message',
        role: 'system',
        pass: 0,
        content: 'system',
      }),
      buildHistoryEntry({ pass: 5 }),
    ];

    const changed = applyDementiaPolicy({
      history,
      currentPass: 40,
      limit: 20,
      preserveSystemMessages: false,
    });

    expect(changed).toBe(true);
    expect(history).toEqual([]);
  });

  it('returns false when the limit disables the policy', () => {
    const history = [buildHistoryEntry({ pass: 5 })];

    const changed = applyDementiaPolicy({ history, currentPass: 45, limit: 0 });

    expect(changed).toBe(false);
    expect(history).toHaveLength(1);
  });

  it('keeps entries that are exactly at the age limit', () => {
    const history = [buildHistoryEntry({ pass: 30 })];

    const changed = applyDementiaPolicy({ history, currentPass: 60, limit: 30 });

    expect(changed).toBe(false);
    expect(history).toHaveLength(1);
  });
});
