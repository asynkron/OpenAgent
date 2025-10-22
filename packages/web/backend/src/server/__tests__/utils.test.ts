import { describe, expect, it, jest, afterEach } from '@jest/globals';
import type { WebSocket } from 'ws';

import {
  describeAgentError,
  formatAgentEvent,
  isWebSocketOpen,
  normaliseAgentText,
  type AgentCommandPayload,
  type AgentPayload,
} from '../utils.js';

describe('normaliseAgentText', () => {
  it('converts non-string values to strings', () => {
    expect(normaliseAgentText(42)).toBe('42');
    expect(normaliseAgentText(null)).toBe('');
    expect(normaliseAgentText({ toString: () => 'object' })).toBe('object');
  });

  it('returns empty string when coercion fails', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const problematic = {
      toString() {
        throw new Error('nope');
      },
    };
    expect(normaliseAgentText(problematic)).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('formatAgentEvent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats assistant messages', () => {
    const payload = formatAgentEvent({
      type: 'assistant-message',
      payload: { message: ' Hello ' },
    });
    const expected: AgentPayload = { type: 'agent_message', text: 'Hello' };
    expect(payload).toEqual(expected);
  });

  it('normalises assistant message state values', () => {
    const payload = formatAgentEvent({
      type: 'assistant-message',
      payload: { message: 'Hello', state: ' FINAL ' },
    });
    const expected: AgentPayload = { type: 'agent_message', text: 'Hello', state: 'final' };
    expect(payload).toEqual(expected);
  });

  it('omits assistant messages without meaningful text', () => {
    expect(
      formatAgentEvent({ type: 'assistant-message', payload: { message: '   ' } }),
    ).toBeUndefined();
  });

  it('formats status events with optional fields', () => {
    const payload = formatAgentEvent({
      type: 'status',
      payload: {
        message: 'Working',
        level: 'info',
        details: 'done',
        title: ' Agent ',
      },
    });
    expect(payload).toEqual({
      type: 'agent_status',
      text: 'Working',
      eventType: 'status',
      level: 'info',
      details: 'done',
      title: 'Agent',
    });
  });

  it('preserves runtime event identifiers', () => {
    const payload = formatAgentEvent({
      type: 'status',
      message: 'Update',
      __id: ' event-42 ',
    });

    expect(payload).toEqual({
      type: 'agent_status',
      text: 'Update',
      eventType: 'status',
      __id: 'event-42',
    });
  });

  it('formats command results with command, result, and preview details', () => {
    const payload = formatAgentEvent({
      type: 'command-result',
      payload: {
        command: {
          run: '  ls  ',
          description: ' List ',
          shell: ' /bin/bash ',
          cwd: ' /tmp ',
          timeout_sec: 5,
          filter_regex: '.*',
          tail_lines: 10,
        },
        result: {
          exit_code: 0,
          runtime_ms: 123,
          killed: false,
        },
        preview: {
          stdoutPreview: ' ok ',
          stderrPreview: '  ',
        },
      },
    }) as AgentCommandPayload;

    expect(payload).toEqual({
      type: 'agent_command',
      command: {
        run: 'ls',
        description: 'List',
        shell: '/bin/bash',
        cwd: '/tmp',
        timeoutSeconds: 5,
        filterRegex: '.*',
        tailLines: 10,
      },
      exitCode: 0,
      runtimeMs: 123,
      killed: false,
      preview: { stdout: ' ok ' },
    });
  });

  it('drops unusable command preview data', () => {
    const payload = formatAgentEvent({
      type: 'command-result',
      payload: {
        preview: {
          stdout: '   ',
          stderr: '   ',
        },
      },
    }) as AgentCommandPayload;

    expect(payload.preview).toBeUndefined();
  });

  it('formats request input metadata when serialisable', () => {
    const payload = formatAgentEvent({
      type: 'request-input',
      payload: {
        prompt: 'hello',
        level: 'warn',
        metadata: { scope: 'user-input', nested: { value: 1 } },
      },
    });
    expect(payload).toEqual({
      type: 'agent_request_input',
      prompt: 'hello',
      level: 'warn',
      metadata: { scope: 'user-input', nested: { value: 1 } },
    });
  });

  it('drops request input metadata when serialisation fails', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cyclic: Record<string, unknown> = { scope: 'user-input' };
    cyclic.self = cyclic;

    const payload = formatAgentEvent({
      type: 'request-input',
      payload: {
        prompt: 'hello',
        metadata: cyclic,
      },
    });

    expect(payload).toEqual({ type: 'agent_request_input', prompt: 'hello' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('supports legacy top-level fields when payload is absent', () => {
    const payload = formatAgentEvent({ type: 'status', message: 'Legacy status' });
    expect(payload).toEqual({
      type: 'agent_status',
      text: 'Legacy status',
      eventType: 'status',
    });
  });

  it('returns undefined for unsupported events', () => {
    expect(formatAgentEvent({ type: 'unknown' })).toBeUndefined();
  });
});

describe('describeAgentError', () => {
  it('prefers error messages', () => {
    expect(describeAgentError(new Error('boom'))).toBe('boom');
  });

  it('handles string values and fallbacks', () => {
    expect(describeAgentError('broken')).toBe('broken');
    expect(describeAgentError(123)).toBe('Unknown error');
  });
});

describe('isWebSocketOpen', () => {
  it('checks ready state', () => {
    const openSocket = { readyState: 1, OPEN: 1 } as const;
    const closedSocket = { readyState: 2, OPEN: 1 } as const;

    expect(isWebSocketOpen(openSocket as unknown as WebSocket)).toBe(true);
    expect(isWebSocketOpen(closedSocket as unknown as WebSocket)).toBe(false);
  });
});
