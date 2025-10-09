/**
 * Integration tests that hit the real OpenAI Responses API.
 *
 * These tests are opt-in because they incur real usage costs. Enable them by
 * exporting OPENAGENT_LIVE_OPENAI=1 along with a valid OPENAI_API_KEY before
 * running the suite. Without the flag, the tests are skipped.
 */

import { jest } from '@jest/globals';
import OpenAI from 'openai';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProxyAgent } from 'undici';

import { executeAgentPass } from '../../src/agent/passExecutor.js';
import { createEscState } from '../../src/agent/escState.js';
import { SYSTEM_PROMPT } from '../../src/config/systemPrompt.js';
import { applyFilter, tailLines } from '../../src/utils/text.js';
import { runCommand, runRead } from '../../src/commands/run.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const liveOpenAIEnabled = process.env.OPENAGENT_LIVE_OPENAI === '1';
const hasApiKey = Boolean(process.env.OPENAI_API_KEY) && liveOpenAIEnabled;

const DEFAULT_MODEL = 'gpt-4o-mini';

let openaiClient;
let openaiModel;

function createWorkspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'openagent-live-test-'));
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  };
  return { dir, cleanup };
}

function createPlanManagerStub() {
  let plan = [];
  const clone = (value) => JSON.parse(JSON.stringify(Array.isArray(value) ? value : []));
  return {
    async initialize() {
      return clone(plan);
    },
    async update(nextPlan) {
      plan = clone(nextPlan);
      return clone(plan);
    },
    async reset() {
      plan = [];
      return clone(plan);
    },
    get() {
      return clone(plan);
    },
    isMergingEnabled() {
      return false;
    },
  };
}

function createAutoApprovalManager() {
  return {
    shouldAutoApprove() {
      return { approved: true, source: 'flag' };
    },
    async requestHumanDecision() {
      return { decision: 'approve_once' };
    },
  };
}

async function runSinglePass({ prompt, workspaceDir, events }) {
  const history = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  const { state: escState } = createEscState();
  const planManager = createPlanManagerStub();
  await planManager.initialize();

  const approvalManager = createAutoApprovalManager();

  if (!openaiClient || !openaiModel) {
    throw new Error('OpenAI client not initialised.');
  }

  const openai = openaiClient;
  const model = openaiModel;

  const runCommandInWorkspace = (command, _cwd, timeout, shell) =>
    runCommand(command, workspaceDir, timeout, shell);
  const runReadInWorkspace = (spec, _cwd) => runRead(spec, workspaceDir);

  await executeAgentPass({
    openai,
    model,
    history,
    emitEvent: (event) => events.push(event),
    onDebug: null,
    runCommandFn: runCommandInWorkspace,
    runReadFn: runReadInWorkspace,
    applyFilterFn: applyFilter,
    tailLinesFn: tailLines,
    getNoHumanFlag: () => false,
    setNoHumanFlag: () => {},
    planReminderMessage: 'Pending work remains in the plan. Please continue.',
    startThinkingFn: () => {},
    stopThinkingFn: () => {},
    escState,
    approvalManager,
    historyCompactor: null,
    planManager,
    emitAutoApproveStatus: false,
  });
}

(hasApiKey ? describe : describe.skip)('live OpenAI integration', () => {
  const tempArtifacts = [];

  beforeAll(() => {
    jest.setTimeout(120000);

    if (!process.env.OPENAI_MODEL) {
      process.env.OPENAI_MODEL = DEFAULT_MODEL;
    }
    process.env.OPENAI_MAX_RETRIES = '0';

    if (!process.env.XDG_DATA_HOME) {
      const dir = mkdtempSync(path.join(tmpdir(), 'openagent-live-xdg-'));
      tempArtifacts.push(dir);
      process.env.XDG_DATA_HOME = dir;
    }

    const clientOptions = {
      apiKey: process.env.OPENAI_API_KEY,
    };

    if (process.env.OPENAI_BASE_URL) {
      clientOptions.baseURL = process.env.OPENAI_BASE_URL;
    }

    if (process.env.OPENAI_TIMEOUT_MS) {
      const parsedTimeout = Number.parseInt(process.env.OPENAI_TIMEOUT_MS, 10);
      if (Number.isFinite(parsedTimeout) && parsedTimeout > 0) {
        clientOptions.timeout = parsedTimeout;
      }
    }

    if (process.env.OPENAI_MAX_RETRIES) {
      const parsedRetries = Number.parseInt(process.env.OPENAI_MAX_RETRIES, 10);
      if (Number.isFinite(parsedRetries) && parsedRetries >= 0) {
        clientOptions.maxRetries = parsedRetries;
      }
    }

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
    if (proxyUrl) {
      clientOptions.fetchOptions = {
        dispatcher: new ProxyAgent(proxyUrl),
      };
    }

    openaiClient = new OpenAI(clientOptions);
    openaiModel = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  });

  afterAll(() => {
    for (const dir of tempArtifacts) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        // ignore cleanup errors
      }
    }
    const scratchDir = path.join(PROJECT_ROOT, '.openagent', 'temp');
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  });

  test('executes a run command that echoes hello', async () => {
    const { dir: workspaceDir, cleanup } = createWorkspace();
    const events = [];

    try {
      const prompt = [
        `Workspace: ${workspaceDir}`,
        'Run exactly one shell command that prints "hello".',
        'Return the OpenAgent JSON response with a single run command using echo.',
      ].join('\n');

      await runSinglePass({ prompt, workspaceDir, events });

      const commandResult = events.find((event) => event.type === 'command-result');
      expect(commandResult).toBeDefined();
      expect(commandResult.command?.run).toMatch(/echo/);
      expect(commandResult.result.stdout.trim()).toBe('hello');
      expect(commandResult.result.exit_code).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('creates a markdown file with the requested content', async () => {
    const { dir: workspaceDir, cleanup } = createWorkspace();
    const events = [];
    const targetFile = path.join(workspaceDir, 'live-verification.md');
    const expectedContent = [
      '# Live Verification',
      '- Uses real OpenAI response',
      '- Confirms markdown creation',
      '',
    ].join('\n');

    try {
      const prompt = [
        `Workspace: ${workspaceDir}`,
        'Create a file named live-verification.md with exactly the following Markdown:',
        '# Live Verification',
        '- Uses real OpenAI response',
        '- Confirms markdown creation',
        'Use a single shell command and respond with the OpenAgent JSON payload.',
      ].join('\n');

      await runSinglePass({ prompt, workspaceDir, events });

      const commandResult = events.find((event) => event.type === 'command-result');
      expect(commandResult).toBeDefined();
      expect(commandResult.command?.run).toContain('live-verification.md');
      expect(commandResult.result.exit_code).toBe(0);

      const fileContents = readFileSync(targetFile, 'utf8');
      expect(fileContents).toBe(expectedContent);
    } finally {
      cleanup();
    }
  });
});
