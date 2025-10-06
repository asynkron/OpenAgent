/**
 * Public entry point that re-exports the reusable runtime API from `src/lib`.
 *
 * When executed directly (`node index.js`) it delegates to the CLI runner so we
 * maintain backwards compatibility with the old structure while keeping
 * library-focused consumers free from CLI side effects.
 */
import exported from './src/lib/index.js';
import { maybeRunCli } from './src/cli/runner.js';

export * from './src/lib/index.js';
export default exported;

maybeRunCli(import.meta.url, process.argv);
