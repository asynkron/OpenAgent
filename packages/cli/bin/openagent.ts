#!/usr/bin/env node
/**
 * Thin wrapper that launches the CLI without pulling in the package exports.
 * Useful when the package is installed globally or invoked via `npx`.
 */
import { runCli } from '../src/runner.js';

runCli(process.argv).catch((error: unknown) => {
  // Errors already set `process.exitCode` in `runCli`; rethrowing would emit an
  // unhandled rejection after we have indicated failure, so log once for clarity.
  if (error instanceof Error && error.message) {
    console.error(error.message);
    return;
  }

  console.error(String(error));
});
