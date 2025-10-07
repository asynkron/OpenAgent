import { describe, expect, test } from '@jest/globals';

import { parseAssistantResponse } from '../../src/agent/responseParser.js';

const DIRECT_PAYLOAD = '{"foo":"bar"}';

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
