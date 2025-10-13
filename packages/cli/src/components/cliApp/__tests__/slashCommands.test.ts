/* eslint-env jest */
import { describe, expect, jest, test } from '@jest/globals';

import { createSlashCommandRouter, parseSlashCommandInput } from '../slashCommands.js';

describe('parseSlashCommandInput', () => {
  test('parses command names and arguments', () => {
    expect(parseSlashCommandInput('/history ./tmp/log.json')).toEqual({
      name: 'history',
      rest: './tmp/log.json',
    });
  });

  test('ignores values without the slash prefix', () => {
    expect(parseSlashCommandInput('history 123')).toBeNull();
    expect(parseSlashCommandInput('/')).toBeNull();
    expect(parseSlashCommandInput('/   ')).toBeNull();
  });
});

describe('createSlashCommandRouter', () => {
  test('returns false when no handler matches', async () => {
    const handlers = new Map<string, (rest: string) => boolean>();
    const router = createSlashCommandRouter(handlers);

    await expect(router('hello')).resolves.toBe(false);
  });

  test('invokes the matching handler and normalizes the result', async () => {
    const handler = jest.fn().mockResolvedValue(true);
    const handlers = new Map<string, (rest: string) => boolean | Promise<boolean>>([
      ['history', handler],
    ]);

    const router = createSlashCommandRouter(handlers);

    await expect(router('/history ./out.json')).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith('./out.json');
  });
});
