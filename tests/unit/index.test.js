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
    jest.unstable_mockModule('../../src/services/commandStatsService.js', () => ({
      incrementCommandCount: commandStatsMockFn,
      default: { incrementCommandCount: commandStatsMockFn },
    }));
  }

  if (typeof runCommandMock === 'function') {
    const runRead = jest.fn();
    const runApplyPatch = jest.fn();
    jest.unstable_mockModule('../../src/commands/run.js', () => ({
      runCommand: runCommandMock,
      runRead,
      runApplyPatch,
      default: {
        runCommand: runCommandMock,
        runRead,
        runApplyPatch,
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
describe('createWebSocketBinding export', () => {
  test('exposes the WebSocket binding helper', async () => {
    const { mod } = await loadModule();
    expect(typeof mod.createWebSocketBinding).toBe('function');
  });
});
