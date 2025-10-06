import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

async function loadModule(
  envOverrides = {},
  { commandStatsMock, runCommandMock, httpModuleFactory } = {},
) {
  jest.resetModules();

  process.env = { ...defaultEnv };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  const mockResponsesCreate = jest.fn();
  const MockOpenAI = jest.fn().mockImplementation((config) => ({
    config,
    responses: { create: mockResponsesCreate },
  }));

  jest.unstable_mockModule('dotenv/config', () => ({}));
  jest.unstable_mockModule('openai', () => ({ default: MockOpenAI }));

  if (typeof httpModuleFactory === 'function') {
    const httpModule = await httpModuleFactory();
    jest.unstable_mockModule('node:http', () => httpModule);
  }

  let commandStatsMockFn;
  if (typeof commandStatsMock === 'function') {
    commandStatsMockFn = commandStatsMock;
    jest.unstable_mockModule('../../src/commands/commandStats.js', () => ({
      incrementCommandCount: commandStatsMockFn,
      default: { incrementCommandCount: commandStatsMockFn },
    }));
  }

  if (typeof runCommandMock === 'function') {
    const runBrowse = jest.fn();
    const runEdit = jest.fn();
    const runRead = jest.fn();
    const runReplace = jest.fn();
    const runEscapeString = jest.fn();
    const runUnescapeString = jest.fn();
    jest.unstable_mockModule('../../src/commands/run.js', () => ({
      runCommand: runCommandMock,
      runBrowse,
      runEdit,
      runRead,
      runReplace,
      runEscapeString,
      runUnescapeString,
      default: {
        runCommand: runCommandMock,
        runBrowse,
        runEdit,
        runRead,
        runReplace,
        runEscapeString,
        runUnescapeString,
      },
    }));
  }

  const imported = await import('../../index.js');
  return {
    mod: imported.default,
    MockOpenAI,
    mockResponsesCreate,
    commandStatsMock: commandStatsMockFn,
  };
}

afterEach(() => {
  delete global.fetch;
  process.env = { ...defaultEnv };
  jest.resetModules();
  jest.clearAllMocks();
});

describe('getOpenAIClient', () => {
  test('throws when OPENAI_API_KEY is missing', async () => {
    const { mod } = await loadModule({ OPENAI_API_KEY: null });
    expect(() => mod.getOpenAIClient()).toThrow('OPENAI_API_KEY not found');
  });

  test('returns memoized OpenAI client when key is set', async () => {
    const { mod, MockOpenAI } = await loadModule({ OPENAI_API_KEY: 'test-key' });
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
  test('approves allowlisted single command', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    const result = mod.isPreapprovedCommand({ run: 'ls', shell: 'bash', cwd: '.' }, cfg);
    expect(result).toBe(true);
  });

  test('rejects commands with newlines', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    const result = mod.isPreapprovedCommand({ run: 'ls\npwd', shell: 'bash' }, cfg);
    expect(result).toBe(false);
  });

  test('rejects commands with pipes', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    expect(mod.isPreapprovedCommand({ run: 'ls | grep foo' }, cfg)).toBe(false);
  });

  test('rejects commands with process substitution', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    expect(mod.isPreapprovedCommand({ run: 'ls >(cat)' }, cfg)).toBe(false);
  });

  test('rejects commands with background execution', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    expect(mod.isPreapprovedCommand({ run: 'ls & whoami' }, cfg)).toBe(false);
    expect(mod.isPreapprovedCommand({ run: 'ls &' }, cfg)).toBe(false);
  });

  test('rejects commands with here-doc or here-string redirections', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'cat' }] };
    expect(mod.isPreapprovedCommand({ run: "cat <<'EOF'" }, cfg)).toBe(false);
    expect(mod.isPreapprovedCommand({ run: 'cat <<<"data"' }, cfg)).toBe(false);
  });

  test('rejects commands redirecting all output via &>', async () => {
    const { mod } = await loadModule();
    const cfg = { allowlist: [{ name: 'ls' }] };
    expect(mod.isPreapprovedCommand({ run: 'ls &> output.txt' }, cfg)).toBe(false);
  });

  test('allows browse command with valid URL', async () => {
    const { mod } = await loadModule();
    const result = mod.isPreapprovedCommand(
      { run: 'browse https://example.com' },
      { allowlist: [] },
    );
    expect(result).toBe(true);
  });

  test('rejects browse command with invalid URL', async () => {
    const { mod } = await loadModule();
    const result = mod.isPreapprovedCommand({ run: 'browse ftp://example.com' }, { allowlist: [] });
    expect(result).toBe(false);
  });
});

describe('shellSplit', () => {
  test('splits strings with quotes correctly', async () => {
    const { mod } = await loadModule();
    expect(mod.shellSplit('echo \'hello world\' "quoted text" plain')).toEqual([
      'echo',
      'hello world',
      'quoted text',
      'plain',
    ]);
  });
});

describe('applyFilter', () => {
  test('filters lines using regex', async () => {
    const { mod } = await loadModule();
    const text = 'apple\nbanana\ncherry';
    expect(mod.applyFilter(text, 'an')).toBe('banana');
  });
});

describe('tailLines', () => {
  test('returns the last N lines', async () => {
    const { mod } = await loadModule();
    const text = Array.from({ length: 5 }, (_, i) => `line${i + 1}`).join('\n');
    expect(mod.tailLines(text, 2)).toBe('line4\nline5');
  });
});

describe('extractResponseText', () => {
  test('prefers output_text field', async () => {
    const { mod } = await loadModule();
    const response = { output_text: '  hello world  ' };
    expect(mod.extractResponseText(response)).toBe('hello world');
  });

  test('falls back to output message content', async () => {
    const { mod } = await loadModule();
    const response = {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '  inner text  ' }],
        },
      ],
    };
    expect(mod.extractResponseText(response)).toBe('inner text');
  });

  test('returns empty string when no text present', async () => {
    const { mod } = await loadModule();
    expect(mod.extractResponseText({})).toBe('');
  });
});

describe('runBrowse', () => {
  const url = 'https://example.com/resource';

  const createClient = ({ response, error, isAbortLike } = {}) => {
    const fetch = jest.fn();

    if (error) {
      fetch.mockRejectedValue(error);
    } else {
      fetch.mockResolvedValue(response ?? { body: '', status: 200, statusText: 'OK', ok: true });
    }

    return {
      fetch,
      isAbortLike: jest.fn(isAbortLike ?? (() => false)),
    };
  };

  test('delegates to provided http client fetch', async () => {
    const { mod } = await loadModule();
    const client = createClient({
      response: { body: 'body', status: 200, statusText: 'OK', ok: true },
    });

    const result = await mod.runBrowse(url, 5, client);

    expect(client.fetch).toHaveBeenCalledWith(url, { timeoutSec: 5, method: 'GET' });
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe('body');
    expect(result.stderr).toBe('');
    expect(result.killed).toBe(false);
  });

  test('propagates non-2xx status from client response', async () => {
    const { mod } = await loadModule();
    const client = createClient({
      response: { body: 'missing', status: 404, statusText: 'Not Found', ok: false },
    });

    const result = await mod.runBrowse(url, 1, client);

    expect(result.exit_code).toBe(404);
    expect(result.stderr).toBe('HTTP 404 Not Found');
    expect(result.stdout).toBe('missing');
    expect(result.killed).toBe(false);
  });

  test('marks request as killed when client reports abort', async () => {
    const { mod } = await loadModule();
    const error = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const client = createClient({
      error,
      isAbortLike: (received) => received === error,
    });

    const result = await mod.runBrowse(url, 1, client);

    expect(client.fetch).toHaveBeenCalledWith(url, { timeoutSec: 1, method: 'GET' });
    expect(client.isAbortLike).toHaveBeenCalledWith(error);
    expect(result.exit_code).toBe(1);
    expect(result.stderr).toBe('Aborted');
    expect(result.killed).toBe(true);
  });

  test('falls back to unknown error message when client throws empty error', async () => {
    const { mod } = await loadModule();
    const error = new Error('');
    error.message = '';
    const client = createClient({ error });

    const result = await mod.runBrowse(url, 1, client);

    expect(result.exit_code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Unknown browse error');
    expect(result.killed).toBe(false);
  });
});

describe('runCommandAndTrack', () => {
  test('records command names and delegates to runCommand', async () => {
    const commandStatsMock = jest.fn().mockResolvedValue(true);
    const runCommandMock = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const { mod } = await loadModule({}, { commandStatsMock, runCommandMock });

    await mod.runCommandAndTrack('ls -la', '.', 1);

    expect(runCommandMock).toHaveBeenCalledWith('ls -la', '.', 1);
    expect(commandStatsMock).toHaveBeenCalledWith('ls');
  });
});

describe('loadPreapprovedConfig', () => {
  test('reads approved commands file when present', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preapproved-'));
    const cfgPath = path.join(tmpDir, 'approved_commands.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ allowlist: [{ name: 'ls' }] }));

    const { mod } = await loadModule();
    const originalCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      const cfg = mod.loadPreapprovedConfig();
      expect(cfg.allowlist).toEqual([{ name: 'ls' }]);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('createWebSocketUi export', () => {
  test('exposes the WebSocket binding helper', async () => {
    const { mod } = await loadModule();
    expect(typeof mod.createWebSocketUi).toBe('function');
  });
});
