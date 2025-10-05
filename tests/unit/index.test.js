const fs = require('fs');
const os = require('os');
const path = require('path');

const defaultEnv = { ...process.env };

function loadModule(envOverrides = {}) {
  jest.resetModules();

  process.env = { ...defaultEnv };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  jest.doMock('dotenv', () => ({ config: jest.fn() }));

  const mockResponsesCreate = jest.fn();
  const MockOpenAI = jest.fn().mockImplementation((config) => ({
    config,
    responses: { create: mockResponsesCreate },
  }));
  jest.doMock('openai', () => MockOpenAI);

  const mod = require('../../index.js');
  return { mod, MockOpenAI, mockResponsesCreate };
}

afterEach(() => {
  delete global.fetch;
  process.env = { ...defaultEnv };
  jest.resetModules();
  jest.clearAllMocks();
});

describe('getOpenAIClient', () => {
  test('throws when OPENAI_API_KEY is missing', () => {
    const { mod } = loadModule({ OPENAI_API_KEY: null });
    expect(() => mod.getOpenAIClient()).toThrow('OPENAI_API_KEY not found');
  });

  test('returns memoized OpenAI client when key is set', () => {
    const { mod, MockOpenAI } = loadModule({ OPENAI_API_KEY: 'test-key' });
    const first = mod.getOpenAIClient();
    const second = mod.getOpenAIClient();

    expect(first).toBe(second);
    expect(MockOpenAI).toHaveBeenCalledTimes(1);
    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: undefined,
    });
  });
});

describe('isPreapprovedCommand', () => {
  test('approves allowlisted single command', () => {
    const { mod } = loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    const result = mod.isPreapprovedCommand({ run: 'ls', shell: 'bash', cwd: '.' }, cfg);
    expect(result).toBe(true);
  });

  test('rejects commands with newlines', () => {
    const { mod } = loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    const result = mod.isPreapprovedCommand({ run: 'ls\npwd', shell: 'bash' }, cfg);
    expect(result).toBe(false);
  });

  test('rejects commands with pipes', () => {
    const { mod } = loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    expect(mod.isPreapprovedCommand({ run: 'ls | grep foo' }, cfg)).toBe(false);
  });

  test('allows browse command with valid URL', () => {
    const { mod } = loadModule();
    const result = mod.isPreapprovedCommand({ run: 'browse https://example.com' }, { allowlist: [] });
    expect(result).toBe(true);
  });

  test('rejects browse command with invalid URL', () => {
    const { mod } = loadModule();
    const result = mod.isPreapprovedCommand({ run: 'browse ftp://example.com' }, { allowlist: [] });
    expect(result).toBe(false);
  });
});

describe('shellSplit', () => {
  test('splits strings with quotes correctly', () => {
    const { mod } = loadModule();
    expect(mod.shellSplit("echo 'hello world' \"quoted text\" plain")).toEqual([
      'echo',
      'hello world',
      'quoted text',
      'plain',
    ]);
  });
});

describe('applyFilter', () => {
  test('filters lines using regex', () => {
    const { mod } = loadModule();
    const text = 'apple\nbanana\ncherry';
    expect(mod.applyFilter(text, 'an')).toBe('banana');
  });
});

describe('tailLines', () => {
  test('returns the last N lines', () => {
    const { mod } = loadModule();
    const text = Array.from({ length: 5 }, (_, i) => `line${i + 1}`).join('\n');
    expect(mod.tailLines(text, 2)).toBe('line4\nline5');
  });
});

describe('extractResponseText', () => {
  test('prefers output_text field', () => {
    const { mod } = loadModule();
    const response = { output_text: '  hello world  ' };
    expect(mod.extractResponseText(response)).toBe('hello world');
  });

  test('falls back to output message content', () => {
    const { mod } = loadModule();
    const response = {
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: '  inner text  ' },
          ],
        },
      ],
    };
    expect(mod.extractResponseText(response)).toBe('inner text');
  });

  test('returns empty string when no text present', () => {
    const { mod } = loadModule();
    expect(mod.extractResponseText({})).toBe('');
  });
});

describe('runBrowse', () => {
  test('uses global fetch when available', async () => {
    const { mod } = loadModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('body'),
      status: 200,
      statusText: 'OK',
    });

    const result = await mod.runBrowse('https://example.com', 1);
    expect(fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      method: 'GET',
      redirect: 'follow',
    }));
    expect(result.stdout).toBe('body');
    expect(result.stderr).toBe('');
    expect(result.exit_code).toBe(0);
  });

  test('captures fetch errors', async () => {
    const { mod } = loadModule();
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const result = await mod.runBrowse('https://example.com', 1);
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toContain('network down');
  });
});

describe('runRead', () => {
  test('reads file contents from provided cwd', async () => {
    const { mod } = loadModule();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openagent-read-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'sample.txt'), 'hello world');
      const result = await mod.runRead({ path: 'sample.txt' }, tmpDir);
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toBe('sample.txt:::\nhello world');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('applies max_lines limit when provided', async () => {
    const { mod } = loadModule();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openagent-read-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'sample.txt'), 'line1\nline2\nline3');
      const result = await mod.runRead({ path: 'sample.txt', max_lines: 2 }, tmpDir);
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toBe('sample.txt:::\nline1\nline2');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('reads multiple files and concatenates results', async () => {
    const { mod } = loadModule();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openagent-read-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'alpha.txt'), 'alpha');
      fs.writeFileSync(path.join(tmpDir, 'beta.txt'), 'beta');
      const result = await mod.runRead({ path: 'alpha.txt', paths: ['beta.txt'] }, tmpDir);
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toBe('alpha.txt:::\nalpha\nbeta.txt:::\nbeta');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
