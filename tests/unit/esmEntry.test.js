import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const testFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(testFilePath, '../../..');

describe('esm entry point', () => {
  test('direct import of index.js exposes public surface', async () => {
    const module = await import('../../index.js');
    const entry = module.default ?? module;

    expect(typeof entry.agentLoop).toBe('function');
    expect(typeof entry.runCommandAndTrack).toBe('function');
    expect(typeof entry.runCommand).toBe('function');
    expect(typeof entry.STARTUP_FORCE_AUTO_APPROVE).toBe('boolean');
    expect(entry.PREAPPROVED_CFG).toBeDefined();
  });

  test('package consumers can import("openagent")', () => {
    // Spawn a clean Node.js process so we exercise the public package entry.
    const script = `
      import('openagent').then((mod) => {
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
      env: { ...process.env, NODE_PATH: projectRoot },
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
