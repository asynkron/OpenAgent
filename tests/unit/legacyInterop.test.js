import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const testFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(testFilePath, '../../..');

describe('legacy entry continues to expose expected surface', () => {
  test('legacy entry exposes expected surface', async () => {
    const legacyModule = await import('../../legacy/index.js');
    const legacy = legacyModule.default ?? legacyModule;

    expect(typeof legacy.agentLoop).toBe('function');
    expect(typeof legacy.runCommandAndTrack).toBe('function');
    expect(typeof legacy.runCommand).toBe('function');
    expect(typeof legacy.STARTUP_FORCE_AUTO_APPROVE).toBe('boolean');
    expect(legacy.PREAPPROVED_CFG).toBeDefined();
  });

  test('package consumers can import openagent', () => {
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

  // Ensure the legacy bundle is reachable through the ESM-friendly subpath.
  test('package consumers can import openagent/legacy', () => {
    const script = `
      import('openagent/legacy').then((mod) => {
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
