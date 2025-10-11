// Simple helper that makes sure the esbuild binary matches the current CPU/OS.
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const require = createRequire(import.meta.url);

function resolveEsbuild() {
  try {
    const esbuildPackage = require.resolve('esbuild/package.json', { paths: [projectRoot] });
    return resolve(dirname(esbuildPackage), 'bin', 'esbuild');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return null;
    }

    throw error;
  }
}

function esbuildNeedsRebuild() {
  const esbuildScript = resolveEsbuild();

  if (!esbuildScript) {
    return true;
  }

  try {
    execFileSync(esbuildScript, ['--version']);
    return false;
  } catch (error) {
    const message = `${error?.stderr || error?.stdout || error?.message || ''}`.toLowerCase();
    if (error?.code === 'ENOEXEC' || message.includes('exec format error')) {
      return true;
    }

    if (error?.code === 'ENOENT') {
      return true;
    }

    // Some environments report incompatible binaries as a generic non-zero exit
    if (typeof error?.status === 'number' && error.status !== 0) {
      if (message.includes('syntax error')) {
        return true;
      }

      // Fallback: treat unexpected exit codes as incompatibility so we attempt a rebuild.
      return true;
    }

    throw error;
  }
}

if (esbuildNeedsRebuild()) {
  console.log('Detected incompatible esbuild binary. Rebuilding esbuild for this platform...');
  const rebuild = spawnSync('npm', ['rebuild', 'esbuild'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (rebuild.status !== 0) {
    console.error('Failed to rebuild esbuild.');
    process.exit(rebuild.status ?? 1);
  }

  try {
    const esbuildScript = resolveEsbuild();

    if (!esbuildScript) {
      throw new Error('esbuild package is missing after rebuild.');
    }

    execFileSync(esbuildScript, ['--version'], { stdio: 'ignore' });
  } catch (error) {
    console.error('esbuild is still unavailable after rebuilding.');
    console.error(error?.message ?? error);
    process.exit(1);
  }
}
