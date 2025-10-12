/* eslint-env jest */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { jest } from '@jest/globals';

const defaultEnv = { ...process.env };

const MISSING_OPENAI_API_KEY_MESSAGE = [
  'OPENAI_API_KEY is missing. Action required: copy .env.example to packages/cli/.env and set OPENAI_API_KEY=<your key> before re-running OpenAgent.',
  '',
  'How to fix it:',
  '1. Copy the template env file: cp packages/cli/.env.example packages/cli/.env',
  '2. Open packages/cli/.env and set OPENAI_API_KEY=<your OpenAI API key>.',
  '3. Save the file and restart OpenAgent (`npm start` or `npx openagent`).',
  'Need help finding your key? https://platform.openai.com/api-keys',
].join('\n');

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
  jest.unstable_mockModule('@ai-sdk/openai', () => ({ createOpenAI: MockOpenAI }));

  if (typeof httpModuleFactory === 'function') {
    const httpModule = await httpModuleFactory();
    jest.unstable_mockModule('node:http', () => httpModule);
  }

  let commandStatsMockFn;
  if (typeof commandStatsMock === 'function') {
    commandStatsMockFn = commandStatsMock;
    jest.unstable_mockModule('../../core/dist/src/services/commandStatsService.js', () => ({
      incrementCommandCount: commandStatsMockFn,
      default: { incrementCommandCount: commandStatsMockFn },
    }));
  }

  if (typeof runCommandMock === 'function') {
    jest.unstable_mockModule('../../core/dist/src/commands/run.js', () => ({
      runCommand: runCommandMock,
      default: {
        runCommand: runCommandMock,
      },
    }));
  }

  const imported = await import('../index.ts');
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
    expect(() => mod.getOpenAIClient()).toThrow(MISSING_OPENAI_API_KEY_MESSAGE);
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
  test('returns trimmed arguments from open-agent function call', async () => {
    const { mod } = await loadModule();
    const response = {
      output_text: 'ignored text',
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'function_call',
          name: 'open-agent',
          call_id: 'call_1',
          arguments: '  {"message":"Hello there"}  ',
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'fallback text' }],
        },
      ],
    };
    expect(mod.extractResponseText(response)).toBe('{"message":"Hello there"}');
  });

  test('stringifies object arguments for open-agent function call', async () => {
    const { mod } = await loadModule();
    const response = {
      output: [
        {
          type: 'function_call',
          name: 'open-agent',
          call_id: 'call_2',
          arguments: { message: 'Structured payload' },
        },
      ],
    };
    expect(mod.extractResponseText(response)).toBe('{"message":"Structured payload"}');
  });

  test('falls back to output message content when no function call present', async () => {
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

describe('extractOpenAgentToolCall', () => {
  test('returns payload with trimmed arguments and call id', async () => {
    const { mod } = await loadModule();
    const response = {
      output: [
        {
          type: 'function_call',
          name: 'open-agent',
          call_id: 'call_123',
          arguments: '  {"message":"Payload"}  ',
        },
      ],
    };

    expect(mod.extractOpenAgentToolCall(response)).toEqual({
      name: 'open-agent',
      call_id: 'call_123',
      arguments: '{"message":"Payload"}',
    });
  });

  test('returns null when open-agent function call is missing', async () => {
    const { mod } = await loadModule();
    const response = {
      output: [
        {
          type: 'function_call',
          name: 'other-tool',
          arguments: '{"message":"no-op"}',
        },
      ],
    };

    expect(mod.extractOpenAgentToolCall(response)).toBeNull();
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
