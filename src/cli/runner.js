/**
 * CLI bootstrap wiring extracted from the legacy root `index.js`.
 *
 * It keeps the `src/lib/index.js` module focused on reusable exports while
 * preserving the old command-line behaviour via `runCli`/`maybeRunCli`.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  agentLoop,
  applyStartupFlagsFromArgv,
  handleTemplatesCli,
  handleShortcutsCli,
} from '../lib/index.js';

export function maybeHandleCliExtensions(argv = process.argv) {
  const mode = argv[2] || '';
  if (mode === 'templates') {
    handleTemplatesCli(argv);
    return true;
  }
  if (mode === 'shortcuts') {
    handleShortcutsCli(argv);
    return true;
  }
  return false;
}

export async function runCli(argv = process.argv) {
  applyStartupFlagsFromArgv(argv);

  if (maybeHandleCliExtensions(argv)) {
    return;
  }

  try {
    await agentLoop();
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
