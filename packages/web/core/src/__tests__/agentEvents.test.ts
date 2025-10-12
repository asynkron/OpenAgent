import {
  normaliseAgentRuntimeEvent,
  serialiseAgentRuntimeEvent,
  type AgentCommandClientPayload,
  type AgentStatusClientPayload,
} from '../events.js';
import { normaliseAgentText } from '../text.js';

describe('normaliseAgentText', () => {
  it('returns strings unchanged', () => {
    expect(normaliseAgentText('hello')).toBe('hello');
  });

  it('coerces numbers and booleans', () => {
    expect(normaliseAgentText(42)).toBe('42');
    expect(normaliseAgentText(true)).toBe('true');
  });

  it('guards against stringification errors', () => {
    const value = {
      toString() {
        throw new Error('nope');
      },
    };
    expect(normaliseAgentText(value)).toBe('');
  });
});

describe('normaliseAgentRuntimeEvent', () => {
  it('maps assistant messages into agent_message payloads', () => {
    const payload = normaliseAgentRuntimeEvent({
      type: 'assistant-message',
      message: '  hello  ',
    });
    expect(payload).toEqual({ type: 'agent_message', text: 'hello' });
  });

  it('returns undefined for empty assistant messages', () => {
    expect(normaliseAgentRuntimeEvent({ type: 'assistant-message', message: '   ' })).toBeUndefined();
  });

  it('retains status metadata when present', () => {
    const payload = normaliseAgentRuntimeEvent({
      type: 'status',
      message: 'All good',
      level: 'info',
      details: 'Details here',
      title: 'Agent status',
    }) as AgentStatusClientPayload;
    expect(payload).toEqual({
      type: 'agent_status',
      eventType: 'status',
      text: 'All good',
      level: 'info',
      details: 'Details here',
      title: 'Agent status',
    });
  });

  it('defaults error messages when missing', () => {
    const payload = normaliseAgentRuntimeEvent({
      type: 'error',
    });
    expect(payload).toEqual({
      type: 'agent_error',
      message: 'Agent runtime reported an error.',
    });
  });

  it('emits thinking payloads for start/stop only', () => {
    expect(normaliseAgentRuntimeEvent({ type: 'thinking', state: 'start' })).toEqual({
      type: 'agent_thinking',
      state: 'start',
    });
    expect(normaliseAgentRuntimeEvent({ type: 'thinking', state: 'done' })).toBeUndefined();
  });

  it('passes through plan arrays untouched', () => {
    const plan = [{ id: '1' }, { id: '2' }];
    expect(normaliseAgentRuntimeEvent({ type: 'plan', plan })).toEqual({
      type: 'agent_plan',
      plan,
    });
  });

  it('normalises command payloads with trimming and filtering', () => {
    const payload = normaliseAgentRuntimeEvent({
      type: 'command-result',
      command: {
        run: '  ls -la  ',
        description: '  List ',
        shell: ' bash ',
        cwd: ' /tmp ',
        timeout_sec: 10,
        filter_regex: '  foo ',
        tail_lines: 5,
      },
      result: {
        exit_code: 0,
        runtime_ms: 123,
        killed: false,
      },
      preview: {
        stdoutPreview: ' output\n',
        stderrPreview: ' ',
      },
    }) as AgentCommandClientPayload;

    expect(payload).toEqual({
      type: 'agent_command',
      command: {
        run: 'ls -la',
        description: 'List',
        shell: 'bash',
        cwd: '/tmp',
        timeoutSeconds: 10,
        filterRegex: 'foo',
        tailLines: 5,
      },
      exitCode: 0,
      runtimeMs: 123,
      killed: false,
      preview: {
        stdout: ' output\n',
      },
    });
  });

  it('emits request input payloads with metadata clones', () => {
    const metadata = { scope: 'system', extra: { nested: true } };
    const payload = normaliseAgentRuntimeEvent({
      type: 'request-input',
      prompt: 'Proceed?',
      level: 'warn',
      metadata,
    });

    expect(payload).toEqual({
      type: 'agent_request_input',
      prompt: 'Proceed?',
      level: 'warn',
      metadata: { scope: 'system', extra: { nested: true } },
    });

    if (!payload || payload.type !== 'agent_request_input') {
      throw new Error('payload should exist');
    }
    expect(payload.metadata).not.toBe(metadata);
  });
});

describe('serialiseAgentRuntimeEvent', () => {
  it('returns JSON when normalisation succeeds', () => {
    const json = serialiseAgentRuntimeEvent({ type: 'status', message: 'Online' });
    expect(json).toBe('{"type":"agent_status","eventType":"status","text":"Online"}');
  });

  it('returns undefined when no payload is produced', () => {
    expect(serialiseAgentRuntimeEvent({ type: 'assistant-message', message: '' })).toBeUndefined();
  });
});
