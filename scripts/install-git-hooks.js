import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const hooksDir = resolve(repoRoot, '.githooks');

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

try {
  runGit(['rev-parse', '--is-inside-work-tree']);
} catch (error) {
  // Skip configuration when executed outside of a Git repository (e.g. when installed as a dependency).
  console.warn('[install-git-hooks] Skipping: not running inside a Git repository.');
  process.exit(0);
}

if (!existsSync(hooksDir)) {
  console.warn('[install-git-hooks] Skipping: .githooks directory is missing.');
  process.exit(0);
}

let currentHooksPath = '';

try {
  currentHooksPath = runGit(['config', '--get', 'core.hooksPath']);
} catch (error) {
  // `core.hooksPath` might be unset; that's fine and we'll configure it below.
}

const resolvedCurrentPath = currentHooksPath ? resolve(repoRoot, currentHooksPath) : null;

if (resolvedCurrentPath === hooksDir) {
  const displayPath = relative(repoRoot, hooksDir) || hooksDir;
  console.log(`[install-git-hooks] Hooks already configured for "${displayPath}".`);
  process.exit(0);
}

try {
  runGit(['config', 'core.hooksPath', hooksDir]);
  const displayPath = relative(repoRoot, hooksDir) || hooksDir;
  console.log(`[install-git-hooks] Configured core.hooksPath to "${displayPath}".`);
} catch (error) {
  console.warn('[install-git-hooks] Failed to configure git hooks.');
  if (error instanceof Error) {
    console.warn(error.message);
  }
}
