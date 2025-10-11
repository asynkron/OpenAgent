/* eslint-env jest */
import { spawnSync } from 'node:child_process';
import { mkdir, lstat, symlink } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const testFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(testFilePath), '../../..');
const workspaceScopeDir = path.join(projectRoot, 'node_modules', '@asynkron');

async function ensureWorkspaceLinks() {
  await mkdir(workspaceScopeDir, { recursive: true });

  const links = [
    {
      target: path.join(projectRoot, 'packages/cli'),
      link: path.join(workspaceScopeDir, 'openagent'),
    },
    {
      target: path.join(projectRoot, 'packages/core'),
      link: path.join(workspaceScopeDir, 'openagent-core'),
    },
  ];

  for (const { target, link } of links) {
    try {
      const stats = await lstat(link);
      if (stats.isSymbolicLink() || stats.isDirectory()) {
        continue;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      await symlink(target, link, 'dir');
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

describe('esm entry point', () => {
  beforeAll(async () => {
    await ensureWorkspaceLinks();
  });

  test('direct import of index.js exposes public surface', async () => {
    const module = await import('../index.js');
    const entry = module.default ?? module;

    expect(typeof entry.agentLoop).toBe('function');
    expect(typeof entry.runCommandAndTrack).toBe('function');
    expect(typeof entry.runCommand).toBe('function');
    expect(typeof entry.STARTUP_FORCE_AUTO_APPROVE).toBe('boolean');
    expect(entry.PREAPPROVED_CFG).toBeDefined();
  });

  test('package consumers can import("@asynkron/openagent")', () => {
    // Spawn a clean Node.js process so we exercise the public package entry.
    const script = `
      import('@asynkron/openagent').then((mod) => {
        const resolved = mod.default ?? mod;
        console.log(JSON.stringify({
          hasLoop: typeof resolved.agentLoop === 'function',
          hasTracker: typeof resolved.runCommandAndTrack === 'function'
        }));
      }).catch((err) => {
        console.error(err);
        process.exit(1);
      });
    `;

    const result = spawnSync(process.execPath, ['-e', script], {
      env: process.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const outputLines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const payload = JSON.parse(outputLines[outputLines.length - 1]);
    expect(payload).toEqual({ hasLoop: true, hasTracker: true });
  });
});
