/* eslint-env jest */
import { describe, expect, test } from '@jest/globals';

import { parseAssistantResponse } from '../responseParser.js';
import { nestedShellResponseText } from '../../../../../tests/integration/__fixtures__/openaiNestedShellResponse.js';

const DIRECT_PAYLOAD = '{"foo":"bar"}';

// Reuse the real nested-shell payload captured from OpenAI to keep the unit and
// integration suites aligned on the tricky newline-and-shell normalization case.

describe('parseAssistantResponse', () => {
  test('parses direct JSON payloads without recovery', () => {
    const result = parseAssistantResponse(DIRECT_PAYLOAD);

    expect(result).toEqual({
      ok: true,
      value: { foo: 'bar' },
      normalizedText: DIRECT_PAYLOAD,
      recovery: { strategy: 'direct' },
    });
  });

  test('recovers from fenced JSON blocks', () => {
    const fenced = '```json\n{ "hi": "there" }\n```';

    const result = parseAssistantResponse(fenced);

    expect(result).toEqual({
      ok: true,
      value: { hi: 'there' },
      normalizedText: '{ "hi": "there" }',
      recovery: { strategy: 'code_fence' },
    });
  });

  test('recovers the first balanced JSON object embedded in text', () => {
    const noisy = 'Some chatter before { "count": 3, "nested": { "ok": true } } trailing text';

    const result = parseAssistantResponse(noisy);

    expect(result).toEqual({
      ok: true,
      value: { count: 3, nested: { ok: true } },
      normalizedText: '{ "count": 3, "nested": { "ok": true } }',
      recovery: { strategy: 'balanced_slice' },
    });
  });

  test('normalizes run commands emitted without a dedicated run property', () => {
    const payload = JSON.stringify({
      message: 'Running command `echo hello`.',
      plan: [
        {
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: {
            cwd: '.',
            shell: 'echo hello',
          },
        },
      ],
    });

    const result = parseAssistantResponse(payload);

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      message: 'Running command `echo hello`.',
      plan: [
        {
          age: 0,
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: {
            cwd: '.',
            run: 'echo hello',
          },
        },
      ],
    });
  });

  test('wraps raw string command payloads in a run object', () => {
    const payload = JSON.stringify({
      message: 'Raw command provided as string.',
      plan: [
        {
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: 'ls',
        },
      ],
    });

    const result = parseAssistantResponse(payload);

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      message: 'Raw command provided as string.',
      plan: [
        {
          age: 0,
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: {
            run: 'ls',
          },
        },
      ],
    });
  });

  test('flattens array command payloads into a run string', () => {
    const payload = JSON.stringify({
      message: 'Command tokens provided as array.',
      plan: [
        {
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: ['apply_patch', "<<'PATCH'", 'content'],
        },
      ],
    });

    const result = parseAssistantResponse(payload);

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      message: 'Command tokens provided as array.',
      plan: [
        {
          age: 0,
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: {
            run: "apply_patch <<'PATCH' content",
          },
        },
      ],
    });
  });

  test('normalizes nested shell command payloads emitted by the model', () => {
    const payload = JSON.stringify({
      message: 'Running command `echo hello`.',
      plan: [
        {
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: {
            shell: {
              command: 'echo hello',
              cwd: '.',
              shell: '/bin/bash',
            },
            timeout_sec: 5,
          },
        },
      ],
    });

    const result = parseAssistantResponse(payload);

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      message: 'Running command `echo hello`.',
      plan: [
        {
          age: 0,
          id: 'plan-step-1',
          title: 'Execute command',
          status: 'pending',
          command: {
            cwd: '.',
            timeout_sec: 5,
            run: 'echo hello',
            shell: '/bin/bash',
          },
        },
      ],
    });
  });

  test('recovers payloads containing bare newline characters from the model', () => {
    const result = parseAssistantResponse(nestedShellResponseText);

    expect(result.ok).toBe(true);
    expect(['direct', 'escaped_newlines']).toContain(result.recovery.strategy);
    expect(result.value).toEqual({
      message: expect.stringMatching(/^Running `echo(?: |\n)hello`\./),
      plan: [
        {
          age: 0,
          id: 'plan-step-execute',
          title: 'Execute nested shell',
          status: 'pending',
          command: {
            cwd: '.',
            shell: '/bin/bash',
            run: 'echo hello',
          },
        },
      ],
    });
  });

  test('returns structured attempts when parsing fails', () => {
    const result = parseAssistantResponse('not json at all');

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.attempts).toEqual(
      expect.arrayContaining([expect.objectContaining({ strategy: 'direct' })]),
    );
  });

  test('rejects blank payloads', () => {
    const result = parseAssistantResponse('   ');

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.attempts).toEqual([]);
  });
});
