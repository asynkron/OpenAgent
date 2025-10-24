import { describe, expect, it } from '@jest/globals';

import { resolveAgentEventDisplay } from '../chat_eventDisplay.js';

describe('resolveAgentEventDisplay', () => {
  it('omits debug events from the UI', () => {
    const result = resolveAgentEventDisplay('debug', {
      text: 'Internal debug output',
    });

    expect(result).toBeNull();
  });

  it('returns display information for supported event types', () => {
    const result = resolveAgentEventDisplay('status', {
      title: 'Status update',
      details: 'Connected to runtime',
    });

    expect(result).not.toBeNull();
    expect(result?.display.header).toBe('Status update');
    expect(result?.display.body).toBe('Connected to runtime');
  });
});
