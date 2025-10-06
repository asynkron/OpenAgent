import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadRenderer() {
  jest.resetModules();
  process.env = { ...defaultEnv };
  jest.unstable_mockModule('dotenv/config', () => ({}));
  const imported = await import('../../index.js');
  return imported.default;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...defaultEnv };
});

describe('wrapStructuredContent', () => {
  test('trims surrounding whitespace from messages', async () => {
    const mod = await loadRenderer();
    expect(mod.wrapStructuredContent('  hello world  ')).toBe('hello world');
  });

  test('returns empty string for falsy values', async () => {
    const mod = await loadRenderer();
    expect(mod.wrapStructuredContent('')).toBe('');
    expect(mod.wrapStructuredContent(null)).toBe('');
    expect(mod.wrapStructuredContent(undefined)).toBe('');
  });

  test('preserves code fence content', async () => {
    const mod = await loadRenderer();
    const fenced = '```js\nconsole.log("hi")\n```';
    expect(mod.wrapStructuredContent(`  ${fenced}  `)).toBe(fenced);
  });
});

describe('renderMarkdownMessage', () => {
  test('returns rendered markdown string', async () => {
    const mod = await loadRenderer();
    const output = mod.renderMarkdownMessage('Hello **world**');
    expect(typeof output).toBe('string');
    expect(output.toLowerCase()).toContain('hello');
  });
});