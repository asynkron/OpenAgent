#!/usr/bin/env node

/**
 * Thin wrapper that launches the CLI without pulling in the root module's
 * exports. Useful when the package is installed globally or invoked via `npx`.
 */
import { runCli } from '../src/cli/runner.js';

runCli(process.argv).catch((error) => {
  // Errors already set `process.exitCode` in `runCli`; rethrowing would emit an
  // unhandled rejection after we have indicated failure, so log once for clarity.
  if (error && error.message) {
    console.error(error.message);
  }
});
