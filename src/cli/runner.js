/**
 * CLI bootstrap wiring extracted from the legacy root `index.js`.
 *
 * It keeps the executable entrypoint lightweight while delegating the reusable
 * logic to `src/lib/index.js`.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBootProbeSummary, runBootProbes } from './bootProbes/index.js';

import { agentLoop, applyStartupFlagsFromArgv } from '../lib/index.js';

export async function runCli(argv = process.argv) {
  const bootProbeResults = await runBootProbes({ cwd: process.cwd() });
  const bootProbeSummary = formatBootProbeSummary(bootProbeResults).trim();
  const systemPromptAugmentation = bootProbeSummary
    ? `Environment information discovered during CLI boot:\n${bootProbeSummary}`
    : '';

  applyStartupFlagsFromArgv(argv);

  try {
    await agentLoop({ systemPromptAugmentation });
  } catch (err) {
    if (err && err.message) {
      process.exitCode = 1;
    }
    throw err;
  }
}

export function maybeRunCli(metaUrl, argv = process.argv) {
  const currentFilePath = fileURLToPath(metaUrl);
  const invokedPath = argv[1] ? path.resolve(argv[1]) : '';
  if (invokedPath && currentFilePath === invokedPath) {
    runCli(argv).catch((error) => {
      // Errors already update `process.exitCode`; echo the message to keep parity with the legacy runner.
      if (error && error.message) {
        console.error(error.message);
      }
    });
    return true;
  }
  return false;
}
