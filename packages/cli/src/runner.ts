/**
 * CLI bootstrap wiring extracted from the legacy root `index.js`.
 *
 * It keeps the executable entrypoint lightweight while delegating the reusable
 * logic to the core runtime module.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { formatBootProbeSummary, runBootProbes } from './bootProbes/index.js';
import { agentLoop } from './runtime.js';
import { loadCoreModule } from './loadCoreModule.js';

type CliIo = {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
};

type ResolvedCliIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

function resolveIo(io?: CliIo): ResolvedCliIo {
  const target = io ?? {};
  const stdout = typeof target.stdout === 'function' ? target.stdout : console.log;
  const stderr = typeof target.stderr === 'function' ? target.stderr : console.error;
  return { stdout, stderr };
}

const MISSING_OPENAI_API_KEY_SUMMARY =
  'OPENAI_API_KEY is missing. Action required: copy .env.example to packages/cli/.env and set OPENAI_API_KEY=<your key> before re-running OpenAgent.';

const MISSING_OPENAI_API_KEY_STEPS = [
  '1. Copy the template env file: cp packages/cli/.env.example packages/cli/.env',
  '2. Open packages/cli/.env and set OPENAI_API_KEY=<your OpenAI API key>.',
  '3. Save the file and restart OpenAgent (`npm start` or `npx openagent`).',
];

const MISSING_OPENAI_API_KEY_DOCS =
  'Need help finding your key? https://platform.openai.com/api-keys';

export async function runCli(argv: string[] = process.argv, io?: CliIo): Promise<void> {
  const { stdout, stderr } = resolveIo(io);
  if (!process.env.OPENAI_API_KEY) {
    const banner = ['-----', MISSING_OPENAI_API_KEY_SUMMARY, '-----'].join('\n');
    stderr(chalk.red(banner));
    stdout('');
    stdout('How to fix it:');
    for (const step of MISSING_OPENAI_API_KEY_STEPS) {
      stdout(step);
    }
    stdout('');
    stdout(MISSING_OPENAI_API_KEY_DOCS);
    return;
  }

  const coreModule = await loadCoreModule();
  const { applyStartupFlagsFromArgv } = coreModule;
  if (typeof applyStartupFlagsFromArgv !== 'function') {
    throw new TypeError('Core module is missing applyStartupFlagsFromArgv');
  }
  const bootProbeResults = await runBootProbes({ cwd: process.cwd() });
  const bootProbeSummary = formatBootProbeSummary(bootProbeResults).trim();
  const systemPromptAugmentation = bootProbeSummary
    ? `Environment information discovered during CLI boot:\n${bootProbeSummary}`
    : '';

  applyStartupFlagsFromArgv(argv);

  try {
    await agentLoop({ systemPromptAugmentation });
  } catch (error: unknown) {
    if (error instanceof Error && error.message) {
      process.exitCode = 1;
    }
    throw error;
  }
}

export function maybeRunCli(metaUrl: string, argv: string[] = process.argv, io?: CliIo): boolean {
  const resolvedIo = resolveIo(io);
  const currentFilePath = fileURLToPath(metaUrl);
  const invokedPath = argv[1] ? path.resolve(argv[1]) : '';
  if (invokedPath && currentFilePath === invokedPath) {
    void runCli(argv, resolvedIo).catch((error: unknown) => {
      // Errors already update `process.exitCode`; echo the message to keep parity with the legacy runner.
      if (error instanceof Error && error.message) {
        resolvedIo.stderr(error.message);
        return;
      }

      resolvedIo.stderr(String(error));
    });
    return true;
  }
  return false;
}
